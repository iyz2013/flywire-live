# Token rooms and live market coverage

Each `/?token=0x...` URL selects a Robinhood Chain room. The root page follows the home address stored through `/admin`. An admin change resets that room's feed, movement and neural state in place within 10 seconds; explicit token URLs remain on their selected coin.

The Pons graduation catalog is validated, deduplicated and sorted by migration date. Its newest 50 tokens are returned after the pinned home token. Catalog responses cache for 30 seconds, with stale data reported when available during an outage. The endpoint is undocumented and may change.

DEX Screener discovers up to 40 supported indexed base-token pools per room. The server groups V2, V3 and Uniswap V4 subscriptions, waits two blocks and deduplicates by chain, transaction and log index. Removed logs and overlapping scans reconcile shallow reorganizations. Scans run every five seconds when available, with a 20-second backoff for rate limits. Metadata refreshes every two minutes.

SSE checks for changes every 200 ms and sends status at least every two seconds. Browser snapshot polling is a fallback when push delivery stalls. A room retains 500 swaps in memory and displays the most recent 100. Initial retained history does not replay old reactions.

The server permits 20 active shared room watchers and 250 SSE clients. Non-home rooms expire after two idle minutes. No durable transaction history or complete outage recovery is promised. USD values are estimates. Fee decoding, pre-migration bonding curves, other chains and unsupported exchanges are outside current coverage.

See the [README](../README.md) for sources and setup.
