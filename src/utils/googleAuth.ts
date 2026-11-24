import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

let isSigningIn = false;
// In-memory cache only (never localStorage or sessionStorage)
let cachedAccessToken: string | null = null;

function createDriveAuthProvider(selectAccount = false): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  for (const scope of SCOPES) {
    provider.addScope(scope);
  }
  provider.setCustomParameters({
    prompt: selectAccount ? 'select_account consent' : 'consent',
    include_granted_scopes: 'true',
  });
  return provider;
}

async function verifyDriveScopeOnToken(accessToken: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
    );
    if (!res.ok) return true;
    const data = (await res.json()) as { scope?: string };
    if (!data.scope) return true;
    return (
      data.scope.includes('https://www.googleapis.com/auth/drive.readonly') ||
      data.scope.includes('https://www.googleapis.com/auth/drive')
    );
  } catch {
    return true;
  }
}

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: (user: User | null) => void
) => {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        onAuthSuccess?.(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        onAuthFailure?.(user);
      }
    } else {
      cachedAccessToken = null;
      onAuthFailure?.(null);
    }
  });
};

export const googleSignIn = async (
  selectAccount = false
): Promise<{ user: User; accessToken: string }> => {
  try {
    isSigningIn = true;
    const provider = createDriveAuthProvider(selectAccount);
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('No se obtuvo el token de acceso de Google Drive.');
    }

    const hasDriveScope = await verifyDriveScopeOnToken(credential.accessToken);
    if (!hasDriveScope) {
      cachedAccessToken = null;
      throw new Error(
        'En la ventana de Google no se otorgó el permiso para ver y descargar archivos de Google Drive. Pulsa "Sincronizar" nuevamente y marca la casilla de Google Drive.'
      );
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const clearCachedAccessToken = (): void => {
  cachedAccessToken = null;
};

export const logoutGoogle = async (): Promise<void> => {
  await auth.signOut();
  cachedAccessToken = null;
};
