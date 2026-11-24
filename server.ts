import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  DriveProxyError,
  fetchDriveFileBuffer,
  fetchDriveFolderFiles,
} from './api/_drive.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = express();

  app.get('/api/drive/list', async (req, res) => {
    const folderId = typeof req.query.folderId === 'string' ? req.query.folderId.trim() : '';

    try {
      const files = await fetchDriveFolderFiles(folderId);
      res.json({ files });
    } catch (err) {
      if (err instanceof DriveProxyError) {
        res.status(err.status).json({
          ...(err.requiresAuth ? { requiresAuth: true } : {}),
          error: err.message,
        });
        return;
      }
      res.status(502).json({
        error:
          err instanceof Error
            ? `No se pudo conectar con Google Drive: ${err.message}`
            : 'No se pudo conectar con Google Drive.',
      });
    }
  });

  app.get('/api/drive/download', async (req, res) => {
    const fileId = typeof req.query.id === 'string' ? req.query.id.trim() : '';
    const mimeType = typeof req.query.mimeType === 'string' ? req.query.mimeType : '';

    try {
      const buf = await fetchDriveFileBuffer(fileId, mimeType);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.send(buf);
    } catch (err) {
      if (err instanceof DriveProxyError) {
        res.status(err.status).json({
          ...(err.requiresAuth ? { requiresAuth: true } : {}),
          error: err.message,
        });
        return;
      }
      res.status(502).json({
        error:
          err instanceof Error
            ? `Error al descargar archivo de Drive: ${err.message}`
            : 'Error al descargar archivo de Drive.',
      });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
