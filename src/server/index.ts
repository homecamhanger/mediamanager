import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createApiApp } from './app.js';
import { displayHost, exposureWarning, resolveBindHost } from './lib/networkBinding.js';
import { MediaDatabase } from './db/database.js';
import { seedSampleLibraryIfEmpty } from './scanner/sampleGenerator.js';

async function startServer() {
  const db = new MediaDatabase();
  await seedSampleLibraryIfEmpty(db);

  const app = createApiApp(db);
  const port = Number(process.env.PORT ?? 3000);
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const clientDist = path.resolve(process.cwd(), 'dist/client');
    if (fs.existsSync(clientDist)) {
      // Hashed asset filenames are content-addressed, so cache them hard. The
      // HTML entry point must not be, or a deploy would pin an old bundle.
      app.use(
        express.static(clientDist, {
          setHeaders: (res, filePath) => {
            if (/[\\/]assets[\\/]/.test(filePath)) {
              res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            } else {
              res.setHeader('Cache-Control', 'no-cache');
            }
          },
        })
      );
      app.use((req, res, next) => {
        if (req.method === 'GET' && !req.path.startsWith('/api/')) {
          return res.sendFile(path.join(clientDist, 'index.html'));
        }
        return next();
      });
    }
  }

  // Loopback unless HOST says otherwise: this server has no authentication and can
  // read and write the media library, so network exposure must be a deliberate act.
  const host = resolveBindHost();
  const warning = exposureWarning(host);
  if (warning) console.warn(`[security] ${warning}`);

  app.listen(port, host, () => {
    console.log(
      `KodiVault running at http://${displayHost(host)}:${port} (${isProd ? 'production' : 'dev'} mode)`
    );
    if (warning) console.log(`[security] Reached from other machines at http://<this-host>:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start KodiVault:', err);
  process.exit(1);
});
