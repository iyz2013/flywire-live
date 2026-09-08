import { createMarketStream } from './market-stream.js';
import { discoverMarkets } from './markets.js';

export function colonyLineup(tokens) {
  return [...new Map(tokens.map(t => [t.address, t])).values()].slice(0, 50);
}

/** One pooled chain subscription for every colony visitor, separate from single rooms. */
export function createColony(catalog, options = {}) {
  let tokens = [], read, lastUsed = 0, disposed = false, discovery;
  const discover = options.discoverMarkets || discoverMarkets;
  async function markets(_, http) {
    if (discovery) return discovery;
    discovery = (async () => {
      const data = await catalog();
      const next = colonyLineup(data.tokens).map(t => ({ ...t, marketStatus: 'discovering', poolCount: 0 }));
      tokens = next;
      const results = []; let cursor = 0;
      // Bound discovery concurrency; the resulting pools share three log filters.
      await Promise.all(Array.from({ length: 3 }, async () => {
        while (cursor < next.length && !disposed) {
          const token = next[cursor++];
          try {
            const pools = await discover(token.address, http);
            token.poolCount = pools.length; token.marketStatus = pools.length ? 'indexed' : 'unavailable';
            results.push(...pools);
          } catch { token.marketStatus = 'unavailable'; }
        }
      }));
      if (!results.length) throw Error('No colony markets available yet; retrying discovery');
      return [...new Map(results.map(p => [p.pairAddress.toLowerCase(), p])).values()];
    })().finally(() => { discovery = undefined; });
    return discovery;
  }
  const timer = setInterval(() => {
    if (read && Date.now() - lastUsed > 120000) { read.dispose(); read = undefined; }
  }, 30000); timer.unref?.();
  function snapshot() {
    lastUsed = Date.now();
    if (!read) {
      read = createMarketStream('colony', { ...options, scanIntervalMs: 5000, scanSpacingMs: 2000, initialScanBlocks: 30, scanBlockLimit: 250, scanOverlap: 5, discoverMarkets: markets, includeToken: true });
      void read().catch(() => {});
    }
    const data = read.snapshot(), addresses = new Set(tokens.map(t => t.address));
    return { ...data, tokens, events: data.events.filter(e => addresses.has(e.token)), selection: 'Pinned home token and 49 most recent Pons migrations' };
  }
  snapshot.dispose = () => { disposed = true; clearInterval(timer); read?.dispose(); };
  return snapshot;
}

