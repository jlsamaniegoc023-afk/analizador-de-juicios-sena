import type { IncomingMessage, ServerResponse } from 'node:http';
import { DriveProxyError, fetchDriveFileBuffer } from '../_drive.ts';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method && req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Método no permitido.' }));
    return;
  }

  const url = new URL(req.url || '/', 'http://localhost');
  const fileId = (url.searchParams.get('id') || '').trim();
  const mimeType = url.searchParams.get('mimeType') || '';

  try {
    const buf = await fetchDriveFileBuffer(fileId, mimeType);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(buf);
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
            ? `Error al descargar archivo de Drive: ${err.message}`
            : 'Error al descargar archivo de Drive.',
      })
    );
  }
}
