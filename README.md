# flywire.live

A live market visualizer with a 3D fruit fly and an interactive neural network. Confirmed token swaps become sensory inputs; the fly responds with expressive movement.

[Website](https://flywire.live) · [X](https://x.com/FlyWireLive)

## What it does

- **Fly room:** an articulated fly in an outdoor habitat, with orbit, zoom, follow camera and fullscreen controls.
- **Neural network:** measured MaleCNS neuron positions, simulated firing, sampled connections and a brain/nerve-cord view. Direct buy stimulation is green; sell stimulation is red. Pink is reserved for fee inputs, which the live feed does not currently decode.
- **Transactions:** confirmed swaps, estimated USD size, stimulus and movement response. The table displays the latest 100 records; session export includes the retained processed records.
- **Token rooms:** search a Robinhood Chain contract address to open its own room. Other chains and pre-migration bonding curves are not supported.
- **Feed:** the latest 50 Pons migrations, with the selected home coin pinned first.
- **All flies:** `/colony` puts the home coin and 49 recent migrations in a shared 3D garden. Select a numbered fly or activity card to inspect its neural network, follow its movement, or open its individual room. A combined transaction feed sits below the dashboard.
- **Admin:** `/admin` changes the home CA without redeploying. Open home rooms switch within 10 seconds, resetting their feed and simulation while retaining the 3D canvases.
- **Interface:** light/dark themes, documentation, the project X link and a rounded logo favicon.

## How it works

1. DEX Screener identifies supported pools for the selected token.
2. A Node server subscribes to Robinhood Chain block headers and pool logs over WebSocket. V2, V3 and Uniswap V4 swap formats are decoded with viem.
3. After two blocks, swaps are sent to browsers through Server-Sent Events. Overlapping RPC scans attempt to recover missed logs.
4. The browser maps each swap to a sensory population and stimulation intensity. A worker runs a connectome-based leaky integrate-and-fire simulation, using WebGPU when available and CPU otherwise.
5. A separate movement controller animates the fly. Buys raise its target altitude; sells lower it. Turns, darts, circles, hops, flutters, dives and grooming provide variation.

The neural map is based on measured connectivity. Trade mappings, movement and mood labels are authored application behavior, not validated predictions of an animal's response. The fly does not trade, connect a wallet or submit transactions. Google contributed connectomics research and reconstruction technology; Google did not train this project's trading behavior.

## Run locally

Use Node.js 24 and npm.

```sh
npm ci
npm run dev -- --host 127.0.0.1
```

Open the local address printed by Vite. Optional configuration is documented in `.env.example`; copy it to `.env.local` for development. Model data, meshes, fonts and kernels are included in `public/`. Initial neural-model loading can take time. Rendering requires WebGL2; WebGPU requires HTTPS or localhost.

```sh
npm test
npm run build
npm start
```

`npm start` serves the production build and API on port 8080, or `PORT` if set. `npm run preview` also supplies the local API middleware. A static-only host cannot run the live feed or admin API.

## Admin and configuration

Admin access is disabled until `ADMIN_PASSWORD_HASH` is configured. There is no password embedded in the public source.

Generate a salted hash interactively:

```sh
node scripts/hash-admin-password.mjs
```

Set the resulting value as `ADMIN_PASSWORD_HASH` in `.env.local` for development or as a private server environment variable in production. Open `/admin`, sign in, paste a valid CA and choose **Save live**. Saving does not require the token to have migrated yet; movement begins when a supported indexed market and new swaps are available.

Supported environment variables:

- `ADMIN_PASSWORD_HASH`: salted scrypt hash used for server-side authentication.
- `SETTINGS_FILE`: home-coin settings file; defaults to `.flydex/settings.json` locally. Use a persistent volume path in production.
- `PORT`: production HTTP port; defaults to `8080`.
- `ROBINHOOD_RPC_URL`: optional HTTP RPC endpoint for chain metadata and timestamps.
- `ROBINHOOD_WS_URL`: optional WebSocket RPC endpoint for live subscriptions.
- `ROBINHOOD_LOGS_RPC_URL`: optional HTTP RPC endpoint for catch-up scans.

Admin sessions use HttpOnly, SameSite cookies, expire after one hour and are held in server memory. Production cookies require HTTPS. Writes require a matching origin; login attempts are rate-limited. Restarting signs admins out, while persisted CA settings remain. Never commit `.env.local`, password hashes, session data or provider credentials.

## Deployment

`Dockerfile` builds the frontend and runs the Node server. `railway.json` configures one always-on Railway replica and a `/health` readiness check. Cloudflare supplies DNS for the hosted site; Railway serves the application and HTTPS.

Attach persistent storage, set `SETTINGS_FILE` to a path on that volume, and configure `ADMIN_PASSWORD_HASH` privately. The deployed service uses a Railway volume mounted at `/data`. See [deployment notes](docs/deployment.md) for setup details.

The `.gz` model files must be served as stored binary bytes, without `Content-Encoding: gzip`; the browser decompresses them itself.

## Project layout

- `index.html`, `src/bootstrap.js`, `src/navigation.js`, `src/observatory.css`: page, settings startup, navigation and themes.
- `colony.html`, `src/colony*.js`, `src/colony.css`, `server/colony.js`: separate colony page, instanced garden, per-token state, activity dashboard and shared multi-token watcher.
- `src/observatory.js`, `src/live-client.js`, `src/tape.js`: live feed, reconciliation, stimulus mapping and transaction UI.
- `src/scene.js`, `src/gait.js`, `src/body/`, `src/reactions.js`, `src/habitat.js`: fly meshes, articulation, movement, cameras and environment.
- `src/brain-3d.js`, `src/event-colors.js`: neural visualization and per-event colors.
- `src/neural-runtime.js`, `src/worker.js`, `src/brain.js`, `src/brain-gpu.js`, `src/stimulus.js`: worker lifecycle, CPU/WebGPU simulation and stimulation.
- `src/data-loader.js`, `public/data/`, `public/body/`, `public/kernels/`: runtime assets, loading and model data. `public/data/manifest.json` records dataset provenance and checksums.
- `server/api.js`, `server/markets.js`, `server/market-stream.js`, `server/catalog.js`: room management, market discovery, subscriptions and migration feed.
- `server/admin.js`, `server/settings.js`, `public/admin.html`, `public/admin.js`: admin authentication, form and persistent settings.
- `server/production.js`: static assets, API routing and health endpoint.
- `tests/`: decoding, reconciliation, motion, stimulation, admin persistence and reset checks.
- `licenses/`, `public/body/assets/NOTICE`, `public/fonts/OFL.txt`: third-party notices.

Earlier upstream UI/controller files and the single-pool adapters remain as reference code. Production enters through `src/bootstrap.js` and `server/production.js`; `server/live-tape.js` also supplies shared RPC helpers. `public/model.json` describes the upstream model and demo, not every behavior of this market integration.

## Coverage and limits

The server supports up to 40 discovered pools per room, 20 active shared room watchers and 250 SSE connections. Non-home rooms are released after two idle minutes. Each watcher retains up to 500 swaps in memory; transaction history is not a durable index.

The colony uses one additional shared WebSocket watcher for its entire lineup, with discovery concurrency limited to three tokens. The browser requests snapshots every 1.5 seconds. Recovery scans use smaller ranges and spaced requests; the watcher stops after two idle minutes. The lineup refreshes with market discovery approximately every two minutes and includes the current home CA. It is ordered by migration recency, not market capitalization.

Colony flies use simplified instanced geometry and independent movement controllers. All 50 cards show measured anatomy with each token's direct stimulation overlay. One full spiking simulation runs for the selected token and resets when selection changes; the cards do not claim to run 50 full neural simulations. Only newly observed swaps after opening the page trigger reactions. The dashboard counts swaps observed during that visit, not lifetime volume.

The feed is near real time, not instant finality. Public RPC limits, network outages and discovery delays can affect delivery. USD sizes use estimated quote conversion. Creator/protocol fees, unsupported exchanges and pre-migration curve trades are not decoded. Initial retained history is displayed without replaying old reactions. Quiet coins can leave the fly resting or grooming.

## Sources and credits

### Research, model and body

- [Xenova / fruit-fly-simulation](https://huggingface.co/spaces/Xenova/fruit-fly-simulation/tree/main): upstream browser implementation, model assets, renderer, worker and loading code. Original license notices are retained.
- [MaleCNS v1.0, HHMI Janelia](https://male-cns.janelia.org/) and [downloads](https://male-cns.janelia.org/download/): measured neuron annotations, neurotransmitters, positions and connectivity. The bundled selection contains 166,700 neuron entries and 25,582,938 directed connections. Source files and filtering are recorded in the [dataset manifest](public/data/manifest.json).
- [Google Research Connectomics](https://research.google/blog/a-connectomics-milestone-mapping-the-complete-male-fruit-fly-brain/): AI-assisted neural reconstruction and the collaboration with HHMI Janelia. The interface credits the research teams; this project is independent of them.
- [Shiu et al., Nature 2024](https://www.nature.com/articles/s41586-024-07763-9) and [Drosophila_brain_model](https://github.com/philshiu/Drosophila_brain_model): reference for the computational neural model. Its published validation does not validate this market mapping or transfer to MaleCNS.
- [NeLy-EPFL / fly-svg-maker](https://github.com/NeLy-EPFL/fly-svg-maker/tree/152506d3471646f009480c81f34aefbaec29a6e5): NeuroMechFly micro-CT-derived meshes and kinematics. The displayed body is a female specimen; the neural dataset is male.
- [Flight-initiation study](https://journals.biologists.com/jeb/article/211/3/341/18097/Performance-trade-offs-in-the-flight-initiation-of): upstream animation reference, recorded in `public/model.json`.

### Live data and infrastructure

- [Robinhood Chain documentation](https://docs.robinhood.com/chain/connecting/): network information and official RPC. This app targets chain ID 4663.
- [PublicNode](https://www.publicnode.com/): default Robinhood Chain HTTP and WebSocket RPC access.
- [DEX Screener API](https://docs.dexscreener.com/api/reference): pool discovery, token metadata and estimated quote prices.
- [Uniswap deployments](https://developers.uniswap.org/docs/protocols/v4/deployments): V4 pool-manager reference. V2/V3/V4 swap events are decoded from on-chain logs.
- [Pons](https://ponsfamily.com/): migration metadata and token images. The [graduation endpoint](https://ponsfamily.com/api/pons-launches/graduations?catalog=1&v=12) is used by its frontend and may change without notice.
- [Railway](https://docs.railway.com/) and [Cloudflare](https://developers.cloudflare.com/dns/): application hosting, persistent settings storage and DNS.

### Libraries and design assets

- [Three.js](https://threejs.org/): 3D rendering.
- [Hugging Face WebGPU kernels](https://huggingface.co/blog/webgpu-kernels): GPU compute runtime.
- [viem](https://viem.sh/): Ethereum ABI decoding and utilities.
- [Vite](https://vite.dev/) and [Node.js](https://nodejs.org/): frontend build and server runtime.
- [Inter](https://rsms.me/inter/): typeface, SIL Open Font License.
- [Lucide](https://lucide.dev/): retained upstream icon notices.
- Project logo: supplied fly silhouette restyled with AI-generated neural texture and the project's violet, cyan and gold palette.

## License

Application code retains the MIT notice in [LICENSE](LICENSE). The data is CC BY 4.0; body assets and GPU kernel packages include Apache-2.0 components; kinematic code and Three.js use MIT; Inter uses OFL; Lucide retains its ISC/MIT notices. Keep the bundled notices when redistributing. Dependency versions are recorded in `package-lock.json`.

## Project media

[Logo](docs/media/logo.png) and [10-second trailer](docs/media/trailer.mp4). The trailer uses the project’s 3D assets, authored animation, and an original synthesized soundtrack.

