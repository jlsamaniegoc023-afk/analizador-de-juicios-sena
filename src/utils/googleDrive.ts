export const DEFAULT_DRIVE_FOLDER_URL =
  'https://drive.google.com/drive/folders/1W0nHdRvO0us15lTjyNYY5TqxtASVwfTr?usp=sharing';

export const DEFAULT_DRIVE_FOLDER_ID = '1W0nHdRvO0us15lTjyNYY5TqxtASVwfTr';

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  modifiedLabel?: string;
  webViewLink?: string;
}

export class DriveAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DriveAuthError';
  }
}

export function extractDriveFolderId(urlOrId: string): string {
  const trimmed = urlOrId.trim();
  if (!trimmed) return DEFAULT_DRIVE_FOLDER_ID;

  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];

  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch) return idParamMatch[1];

  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) return trimmed;

  return DEFAULT_DRIVE_FOLDER_ID;
}

export function isSpreadsheetDriveFile(file: DriveFileItem): boolean {
  const nameLower = file.name.toLowerCase();
  if (
    file.mimeType === 'application/vnd.google-apps.spreadsheet' ||
    file.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.mimeType === 'application/vnd.ms-excel' ||
    file.mimeType === 'text/csv'
  ) {
    return true;
  }
  return /\.(xlsx|xls|csv)$/i.test(nameLower);
}

function isInsufficientScopeError(status: number, errorBody: string): boolean {
  if (status === 401) return true;
  if (status === 403) {
    return (
      errorBody.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') ||
      errorBody.includes('insufficientPermissions') ||
      errorBody.includes('insufficient authentication scopes')
    );
  }
  return false;
}

function extractReadableGoogleError(errText: string, fallback: string): string {
  try {
    const parsed = JSON.parse(errText) as { error?: { message?: string } | string };
    if (typeof parsed?.error === 'string') return parsed.error;
    if (parsed?.error?.message) return parsed.error.message;
  } catch {
    // non-JSON body
  }
  return fallback;
}

export async function listExcelFilesInDriveFolder(
  folderId: string,
  accessToken?: string | null
): Promise<DriveFileItem[]> {
  // Public shared-link folder mode via server proxy (no Gmail login required)
  if (!accessToken) {
    const res = await fetch(
      `/api/drive/list?folderId=${encodeURIComponent(folderId)}`
    );
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        requiresAuth?: boolean;
        error?: string;
      };
      if (data.requiresAuth) {
        throw new DriveAuthError(
          data.error ||
            'Esta carpeta requiere autorización de Google. Pulsa Sincronizar para conectar.'
        );
      }
      throw new Error(
        data.error || `No se pudo leer la carpeta de Google Drive (${res.status}).`
      );
    }
    const payload = (await res.json()) as { files?: DriveFileItem[] };
    return (payload.files || []).filter(isSpreadsheetDriveFile);
  }

  // Authenticated OAuth Drive v3 API mode
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const fields = encodeURIComponent('files(id,name,mimeType,size,modifiedTime,webViewLink)');
  const url =
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}` +
    `&orderBy=modifiedTime%20desc&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    if (isInsufficientScopeError(response.status, errText)) {
      throw new DriveAuthError(
        'Falta el permiso de lectura de Google Drive en tu sesión. Pulsa "Sincronizar" y acepta la casilla de Google Drive.'
      );
    }
    const readable = extractReadableGoogleError(errText, response.statusText);
    throw new Error(`No se pudo listar la carpeta de Google Drive (${response.status}): ${readable}`);
  }

  const data = (await response.json()) as { files?: DriveFileItem[] };
  const files = data.files || [];
  return files.filter(isSpreadsheetDriveFile);
}

export async function downloadDriveExcelAsBuffer(
  file: DriveFileItem,
  accessToken?: string | null
): Promise<ArrayBuffer> {
  // Public shared-link download via server proxy (no Gmail login required)
  if (!accessToken) {
    const res = await fetch(
      `/api/drive/download?id=${encodeURIComponent(file.id)}&mimeType=${encodeURIComponent(
        file.mimeType
      )}`
    );
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        requiresAuth?: boolean;
        error?: string;
      };
      if (data.requiresAuth) {
        throw new DriveAuthError(
          data.error ||
            'Este archivo requiere autorización de Google. Pulsa Sincronizar para conectar.'
        );
      }
      throw new Error(
        data.error || `No se pudo descargar "${file.name}" desde Drive (${res.status}).`
      );
    }
    return res.arrayBuffer();
  }

  // Authenticated OAuth Drive v3 API mode
  const isGoogleSheet = file.mimeType === 'application/vnd.google-apps.spreadsheet';
  const url = isGoogleSheet
    ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
        file.id
      )}/export?mimeType=${encodeURIComponent(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )}&supportsAllDrives=true`
    : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
        file.id
      )}?alt=media&supportsAllDrives=true`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    if (isInsufficientScopeError(response.status, errText)) {
      throw new DriveAuthError(
        'Falta el permiso de lectura de Google Drive en tu sesión. Pulsa "Sincronizar" y acepta la casilla de Google Drive.'
      );
    }
    const readable = extractReadableGoogleError(errText, response.statusText);
    throw new Error(
      `No se pudo descargar "${file.name}" desde Google Drive (${response.status}): ${readable}`
    );
  }

  return response.arrayBuffer();
}
