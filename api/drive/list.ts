import type { IncomingMessage, ServerResponse } from 'node:http';
import { DriveProxyError, fetchDriveFolderFiles } from '../_drive.ts';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method && req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Método no permitido.' }));
    return;
  }

  const url = new URL(req.url || '/', 'http://localhost');
  const folderId = (url.searchParams.get('folderId') || '').trim();

  try {
    const files = await fetchDriveFolderFiles(folderId);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ files }));
  } catch (err) {
    if (err instanceof DriveProxyError) {
      res.statusCode = err.status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          ...(err.requiresAuth ? { requiresAuth: true } : {}),
          error: err.message,
        })
      );
      return;
    }

    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        error:
          err instanceof Error
            ? `No se pudo conectar con Google Drive: ${err.message}`
            : 'No se pudo conectar con Google Drive.',
      })
    );
  }
}
