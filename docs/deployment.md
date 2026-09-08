# Deployment

The application needs a Node server, not only static hosting. `npm run build` creates `dist/`; `npm start` serves it together with the live API.

## Railway

1. Create a service from this repository using its Dockerfile.
2. Keep one replica. Watchers, SSE clients and admin sessions are process-local.
3. Attach a persistent volume at `/data` and set `SETTINGS_FILE=/data/settings.json`.
4. Generate a password hash with `node scripts/hash-admin-password.mjs` and store it in the private `ADMIN_PASSWORD_HASH` service variable.
5. Railway mounts volumes as root. With the supplied non-root Docker image, configure the volume permissions or set `RAILWAY_RUN_UID=0` as described in [Railway's volume documentation](https://docs.railway.com/volumes).
6. Deploy and wait for the health check to pass. Add the custom domain and the DNS/ownership records Railway provides. The hosted project uses Cloudflare DNS.

`railway.json` configures `/health`, restart behavior and an always-on service. `/health` checks process readiness; upstream stream health is separately reported by `/api/tape` and the transaction status in the UI.

Use HTTPS for production. The admin cookie is Secure in production. Keep all credentials in service variables, never in public frontend environment variables. Changing a token in `/admin` updates the persistent file without restarting the service. A deployment clears retained transaction history and admin sessions, but leaves the settings volume intact.

The Docker build excludes environment files, local caches, installed dependencies and development notes. Preserve the `.gz` model assets as binary bytes without a `Content-Encoding: gzip` header.

## API

- `GET /api/config`: selected home CA and last update time.
- `GET /api/feed`: pinned home coin and recent Pons migrations.
- `GET /api/tape?token=0x...`: retained swap snapshot and watcher status.
- `GET /api/stream?token=0x...`: Server-Sent Events for swaps and connection status.
- `GET /api/admin/session`: authenticated admin state.
- `POST /api/admin/login`: password authentication.
- `POST /api/admin/settings`: authenticated home-CA update.
- `POST /api/admin/logout`: session revocation.

Admin POST routes require JSON and a matching Origin. Sessions expire after one hour and login attempts are rate-limited. The public feed is read-only and has no wallet or signing capability.
