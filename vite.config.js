import { defineConfig, loadEnv } from 'vite';
import { createReadStream, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApi } from './server/api.js';
import { createSettings } from './server/settings.js';

export default defineConfig(({ mode }) => {
  const root = process.cwd();
  const env = loadEnv(mode, root, '');
  const api = createApi({settings:createSettings(env.SETTINGS_FILE||undefined),admin:{passwordHash:env.ADMIN_PASSWORD_HASH||process.env.ADMIN_PASSWORD_HASH},http:env.ROBINHOOD_RPC_URL, ws:env.ROBINHOOD_WS_URL, logsHttp:env.ROBINHOOD_LOGS_RPC_URL});
  const middleware = server => { server.httpServer?.once('close',()=>api.dispose()); server.middlewares.use(async (req, res, next) => {
    const path = (req.url || '').split('?')[0];
    if (await api(req,res)) return;
    // These are compressed model assets, not HTTP-encoded responses.
    if (/^\/data\/[a-zA-Z0-9_.-]+\.gz$/.test(path)) {
      const file = resolve(root, 'public', path.slice(1));
      if (existsSync(file)) { res.setHeader('Content-Type', 'application/octet-stream'); res.setHeader('Cache-Control', 'public,max-age=3600'); createReadStream(file).pipe(res); return; }
    }
    next();
  }); };
  return {
  base: './',
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  worker: { format: 'es' },
  plugins: [{ name: 'flydex-local-data', configureServer: middleware, configurePreviewServer: middleware }],
}; });
