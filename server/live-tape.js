import { keccak256, toBytes, decodeAbiParameters, parseAbiParameters } from 'viem';
import fs from 'node:fs/promises';
const RPC = 'https://rpc.mainnet.chain.robinhood.com';
const MANAGER = '0x8366a39cc670b4001a1121b8f6a443a643e40951';
const SWAP = keccak256(toBytes('Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)'));
const PARAMETERS = parseAbiParameters('int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee');
export async function rpc(method, params, rpcUrl = RPC) {
  const response = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw Error(`Chain RPC returned ${response.status}`);
  const result = await response.json();
  if (result.error) throw Error(result.error.message);
  return result.result;
}
async function blockTimes(hashes, rpcUrl) {
  if (!hashes.length) return [];
  const response = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(hashes.map((hash,id) => ({ jsonrpc: '2.0', id, method: 'eth_getBlockByHash', params: [hash,false] }))), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw Error(`Chain RPC returned ${response.status}`);
  const values = await response.json();
  if (!Array.isArray(values) || values.some(v => v.error || !v.result)) throw Error('Block timestamps unavailable.');
  return values.map(v => [hashes[v.id], Number(v.result.timestamp) * 1000]);
}
export function decodeSwap(log, pair, tokenDecimals, quoteDecimals, quoteUsd, ts) {
  const [a0, a1] = decodeAbiParameters(PARAMETERS, log.data);
  const token0 = pair.baseToken.address.toLowerCase() < pair.quoteToken.address.toLowerCase();
  const tokenDelta = token0 ? a0 : a1, quoteDelta = token0 ? a1 : a0;
  const quantity = Math.abs(Number(tokenDelta)) / 10 ** tokenDecimals;
  const quote = Math.abs(Number(quoteDelta)) / 10 ** quoteDecimals;
  return { tx: log.transactionHash, logIndex: Number(log.logIndex), ts, side: tokenDelta > 0n ? 'buy' : 'sell', usd: quote * quoteUsd, fee_usd: null, price: quantity ? quote / quantity * quoteUsd : 0, block: Number(log.blockNumber), blockHash: log.blockHash, success: true, pool: pair.pairAddress, usdEstimated: true };
}
export function createLiveTape(token, root, rpcUrl = RPC) {
  const call = (method, params) => rpc(method, params, rpcUrl);
  let pair, lastBlock, latest = [], updatedAt = 0, cached, pending, priceAt = 0, tokenDecimals = 18, quoteDecimals = 18, retryAt = 0, lastError, restored = false;
  const blocks = new Map();
  async function refresh() {
    if (!/^0x[0-9a-f]{40}$/i.test(token || '')) throw Error('Set a valid token address in .env.local.');
    if (!pair || Date.now() - priceAt > 60000) {
      const chain = await call('eth_chainId', []);
      if (Number(chain) !== 4663) throw Error('Unexpected chain ID.');
      const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token}`, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw Error('Pool discovery is unavailable.');
      const data = await response.json();
      const matches = (data.pairs || []).filter(p => p.chainId === 'robinhood' && p.dexId === 'uniswap' && p.labels?.includes('v4') && p.baseToken.address.toLowerCase() === token.toLowerCase());
      const selected = pair ? matches.find(p => p.pairAddress === pair.pairAddress) : matches.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
      if (!selected) throw Error('No supported Uniswap v4 pool found for this token.');
      pair = selected; priceAt = Date.now();
      tokenDecimals = Number(await call('eth_call', [{ to: token, data: '0x313ce567' }, 'latest']));
      quoteDecimals = /^0x0{40}$/.test(pair.quoteToken.address) ? 18 : Number(await call('eth_call', [{ to: pair.quoteToken.address, data: '0x313ce567' }, 'latest']));
    }
    const head = BigInt(await call('eth_blockNumber', [])) - 2n;
    // Two-block confirmation delay, rolling overlap to replace shallow reorgs.
    const from = lastBlock ? lastBlock - 12n : head - 120n;
    const logs = await call('eth_getLogs', [{ address: MANAGER, fromBlock: `0x${from.toString(16)}`, toBlock: `0x${head.toString(16)}`, topics: [SWAP, pair.pairAddress] }]);
    const needed = [...new Set(logs.map(l => l.blockHash))].filter(b => !blocks.has(b));
    for (let i = 0; i < needed.length; i += 40) for (const [hash,time] of await blockTimes(needed.slice(i,i+40), rpcUrl)) blocks.set(hash,time);
    const quoteUsd = Number(pair.priceUsd) / Number(pair.priceNative);
    if (!(quoteUsd > 0 && Number.isFinite(quoteUsd))) throw Error('USD conversion is unavailable.');
    latest = latest.filter(e => e.block < Number(from));
    latest.push(...logs.filter(l => !l.removed).map(l => decodeSwap(l, pair, tokenDecimals, quoteDecimals, quoteUsd, blocks.get(l.blockHash))));
    latest = latest.sort((a,b) => a.block - b.block || a.logIndex - b.logIndex).slice(-2000);
    if (blocks.size > 2500) blocks.clear();
    lastBlock = head; updatedAt = Date.now();
    cached = { status: 'connected', symbol: pair.baseToken.symbol, token, venue: 'Uniswap v4', pool: pair.pairAddress, updatedAt, head: Number(head), usdEstimated: true, events: latest };
    await fs.mkdir(`${root}/.flydex`, { recursive: true });
    await fs.writeFile(`${root}/.flydex/live-tape.json`, JSON.stringify(cached));
    return cached;
  }
  return async () => {
    if (!restored) {
      restored = true;
      try {
        const saved = JSON.parse(await fs.readFile(`${root}/.flydex/live-tape.json`, 'utf8'));
        if (saved.token?.toLowerCase() === token?.toLowerCase() && Array.isArray(saved.events)) { cached = saved; latest = saved.events; lastBlock = BigInt(saved.head); updatedAt = saved.updatedAt; }
      } catch { /* No previous recording is required. */ }
    }
    if (Date.now() < retryAt) { if (cached) return { ...cached, status: 'delayed', error: lastError?.message.includes('429') ? 'RPC rate limited; retrying automatically' : 'Live source unavailable; retrying automatically' }; throw lastError; }
    if (cached && Date.now() - updatedAt < 5000) return cached;
    if (!pending) pending = refresh().catch(error => { lastError = error; retryAt = Date.now() + (error.message.includes('429') ? 60000 : 10000); throw error; }).finally(() => { pending = undefined; });
    try { return await pending; }
    catch (error) { if (cached) return { ...cached, status: 'delayed', error: error.message.includes('429') ? 'Public RPC rate limited; retrying automatically' : 'Live source unavailable; retrying automatically' }; throw error; }
  };
}
