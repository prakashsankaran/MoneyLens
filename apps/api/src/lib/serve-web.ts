import { existsSync } from 'node:fs';
import path from 'node:path';
import express, { Router } from 'express';

/**
 * Serves the built web app from the API process, for hosts that run a single
 * container (WEB_DIST_DIR). Elsewhere nginx does this job
 * (infrastructure/docker/nginx.conf); the caching rules match it.
 */
export function serveWeb(dir: string): Router {
  const root = path.resolve(dir);
  const indexFile = path.join(root, 'index.html');
  if (!existsSync(indexFile)) {
    throw new Error(`WEB_DIST_DIR has no index.html: ${root}`);
  }
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    next();
  });
  // Hashed bundle files never change, so they can be cached for a year.
  router.use(
    '/assets',
    express.static(path.join(root, 'assets'), { immutable: true, maxAge: '1y', index: false }),
  );
  router.use(express.static(root, { index: false, maxAge: 0 }));
  // Every other page is the single-page app; index.html is always revalidated
  // so a new deploy is picked up at once.
  router.get(/^(?!\/api(\/|$)).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexFile);
  });
  return router;
}
