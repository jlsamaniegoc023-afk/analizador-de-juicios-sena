export const DRIVE_ID_REGEX = /^[a-zA-Z0-9_-]{10,120}$/;

export interface PublicDriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedLabel?: string;
  webViewLink: string;
}

export class DriveProxyError extends Error {
  status: number;
  requiresAuth: boolean;

  constructor(message: string, status: number, requiresAuth = false) {
    super(message);
    this.name = 'DriveProxyError';
    this.status = status;
    this.requiresAuth = requiresAuth;
  }
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCharCode(Number(dec)))
    .trim();
}

function inferMimeType(fileName: string, entryHtml: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (lower.endsWith('.xls')) {
    return 'application/vnd.ms-excel';
  }
  if (lower.endsWith('.csv')) {
    return 'text/csv';
  }
  if (
    entryHtml.includes('application/vnd.google-apps.spreadsheet') ||
    entryHtml.includes('/spreadsheets/')
  ) {
    return 'application/vnd.google-apps.spreadsheet';
  }
  if (
    entryHtml.includes('application/vnd.ms-excel') ||
    entryHtml.includes('spreadsheetml')
  ) {
    return 'application/vnd.ms-excel';
  }
  return 'application/octet-stream';
}

function isSpreadsheetFile(name: string, mimeType: string): boolean {
  if (
    mimeType === 'application/vnd.google-apps.spreadsheet' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel' ||
    mimeType === 'text/csv'
  ) {
    return true;
  }
  return /\.(xlsx|xls|csv)$/i.test(name);
}

export function parseEmbeddedFolderHtml(html: string): PublicDriveFile[] {
  const files: PublicDriveFile[] = [];
  const seen = new Set<string>();

  const parts = html.split('<div class="flip-entry"');
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];
    const idMatch = chunk.match(/id="entry-([a-zA-Z0-9_-]+)"/);
    const titleMatch = chunk.match(/<div class="flip-entry-title">([\s\S]*?)<\/div>/);
    if (!idMatch || !titleMatch) continue;

    const id = idMatch[1];
    if (seen.has(id)) continue;

    const name = decodeHtmlEntities(titleMatch[1].replace(/<[^>]+>/g, ''));
    if (!name) continue;

    const modMatch = chunk.match(
      /<div class="flip-entry-last-modified"><div>([\s\S]*?)<\/div><\/div>/
    );
    const modifiedLabel = modMatch
      ? decodeHtmlEntities(modMatch[1].replace(/<[^>]+>/g, ''))
      : undefined;

    const mimeType = inferMimeType(name, chunk);
    if (!isSpreadsheetFile(name, mimeType)) continue;

    seen.add(id);
    files.push({
      id,
      name,
      mimeType,
      modifiedLabel,
      webViewLink: `https://drive.google.com/file/d/${id}/view`,
    });
  }

  return files;
}

export async function fetchDriveFolderFiles(folderId: string): Promise<PublicDriveFile[]> {
  if (!DRIVE_ID_REGEX.test(folderId)) {
    throw new DriveProxyError('ID de carpeta de Google Drive inválido.', 400);
  }

  const targetUrl = `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}#list`;
  const response = await fetch(targetUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    },
    redirect: 'follow',
  });

  if (response.url.includes('accounts.google.com') || response.status === 401 || response.status === 403) {
    throw new DriveProxyError(
      'La carpeta de Drive no es pública para lectura sin cuenta.',
      403,
      true
    );
  }

  if (!response.ok) {
    throw new DriveProxyError(
      `Error al consultar la carpeta de Google Drive (${response.status}).`,
      response.status
    );
  }

  const html = await response.text();
  if (html.includes('accounts.google.com/ServiceLogin') && !html.includes('flip-entry')) {
    throw new DriveProxyError(
      'La carpeta de Drive requiere iniciar sesión para ver los archivos.',
      403,
      true
    );
  }

  return parseEmbeddedFolderHtml(html);
}

export async function fetchDriveFileBuffer(fileId: string, mimeType = ''): Promise<Buffer> {
  if (!DRIVE_ID_REGEX.test(fileId)) {
    throw new DriveProxyError('ID de archivo de Google Drive inválido.', 400);
  }

  const isGoogleSheet = mimeType === 'application/vnd.google-apps.spreadsheet';
  const downloadUrl = isGoogleSheet
    ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(fileId)}/export?format=xlsx`
    : `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;

  const response = await fetch(downloadUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    },
    redirect: 'follow',
  });

  if (response.url.includes('accounts.google.com') || response.status === 401 || response.status === 403) {
    throw new DriveProxyError('El archivo requiere autorización de Google Drive.', 403, true);
  }

  if (!response.ok) {
    throw new DriveProxyError(
      `No se pudo descargar el archivo desde Drive (${response.status}).`,
      response.status
    );
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const buf = Buffer.from(await response.arrayBuffer());

  if (contentType.includes('text/html') && !mimeType.includes('csv')) {
    const htmlText = buf.toString('utf8', 0, Math.min(buf.length, 4096));
    const confirmMatch = htmlText.match(/confirm=([0-9A-Za-z_-]+)/);
    const uuidMatch = htmlText.match(/name="uuid"\s+value="([^"]+)"/);
    if (confirmMatch) {
      const retryUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(
        fileId
      )}&export=download&confirm=${encodeURIComponent(confirmMatch[1])}${
        uuidMatch ? `&uuid=${encodeURIComponent(uuidMatch[1])}` : ''
      }`;
      const retryRes = await fetch(retryUrl, { redirect: 'follow' });
      if (retryRes.ok) {
        return Buffer.from(await retryRes.arrayBuffer());
      }
    }
    if (htmlText.includes('ServiceLogin')) {
      throw new DriveProxyError('El archivo requiere autorización de Google Drive.', 403, true);
    }
  }

  return buf;
}
