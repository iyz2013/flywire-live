import { reactionFor } from './reactions.js';
export const DURATION = 30000;
export const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
export const quantile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] || 1;
};
export function hash(value) {
  let state = 2166136261;
  for (const character of value) state = Math.imul(state ^ character.charCodeAt(0), 16777619) >>> 0;
  return state;
}
export function selectedCells(indices, tx) {
  let state = hash(tx);
  return indices.filter(() => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296 < 0.72;
  });
}
// Fixture identifiers deliberately cannot be mistaken for on-chain transaction hashes.
export const demoTrades = [
  [1500, 'buy', 24, .12, 1.01], [5000, 'buy', 95, .475, 1.03],
  [8000, 'sell', 18, .09, 1.02], [10800, 'fee', 1.4, 1.4, 1.02],
  [13500, 'buy', 42, .21, 1.04], [16500, 'buy', 640, 3.2, 1.12],
  [20500, 'sell', 920, 4.6, .98], [24000, 'buy', 22, .11, .99],
  [26700, 'fee', 2, 2, .99],
].map(([ts, side, usd, fee_usd, price], i) => ({ tx: `demo-event-${String(i + 1).padStart(4, '0')}`, ts, side, usd, fee_usd, price, trader: `fixture-${i}`, block: null, success: true }));

/** Normalize once before stimulation: deduplicate, filter, net opposite trader events,
 * coalesce same-class overloads, then log named populations and exclusive motor states. */
export function ingestPons(raw, { dust = 1, maxPulses = 8, cooldown = 2500 } = {}) {
  const unique = new Map();
  for (const event of raw) {
    if (!event.tx || event.success === false || !['buy', 'sell', 'fee'].includes(event.side) ||
      !Number.isFinite(event.usd) || !Number.isFinite(event.ts) || event.usd < dust) continue;
    unique.set(event.id || event.tx, { ...event, sourceTxs: [event.tx] });
  }
  const netted = [];
  for (const e of [...unique.values()].sort((a, b) => a.ts - b.ts)) {
    const prior = netted.findLast(p => e.trader && p.trader === e.trader && e.ts - p.ts <= 300 && p.side !== 'fee' && e.side !== 'fee');
    if (prior) {
      const net = (prior.side === 'buy' ? prior.usd : -prior.usd) + (e.side === 'buy' ? e.usd : -e.usd);
      prior.usd = Math.abs(net); prior.side = net >= 0 ? 'buy' : 'sell';
      prior.fee_usd = (prior.fee_usd || 0) + (e.fee_usd || 0); prior.sourceTxs.push(e.tx);
    } else netted.push(e);
  }
  const log = [], transitions = [{ ts: 0, motor: 'idle' }];
  let lastEscape = -Infinity, lockedUntil = -Infinity;
  const append = (ts, motor) => transitions.push({ ts, motor });
  for (const e of netted.filter(e => e.usd >= dust)) {
    const recent = log.filter(p => e.ts - p.ts <= 300000 && p.side !== 'fee');
    const large = recent.length >= 4 && e.usd >= quantile(recent.map(p => p.usd), .9);
    const sells = recent.filter(p => p.side === 'sell' && e.ts - p.ts <= 2000);
    const falling = sells.length >= 2 && Number.isFinite(e.price) && e.price < sells[0].price;
    const looming = e.side === 'sell' && (large || falling) && e.ts - lastEscape >= cooldown;
    const population = looming ? 'Looming / LC4' : e.side === 'fee' ? 'Water / mild sugar' : e.side === 'sell' ? 'Bitter / deterrent' : large ? 'Sugar + PAM-like reward' : 'Sugar / GRN attractant';
    const p95 = quantile([...log.filter(p => e.ts - p.ts <= 3600000).map(p => p.usd), e.usd], .95);
    const gain = clamp(Math.log10(e.usd + 1) / Math.log10(Math.max(2, p95)), .15, 1);
    const entry = { ...e, population, gain, durationMs: Math.round(200 + 700 * gain), motor: looming ? 'escape' : e.side === 'sell' ? 'retreat' : 'approach' };
    entry.reaction = reactionFor(entry);
    const recentPulses = log.filter(p => e.ts - p.ts < 1000);
    if (recentPulses.length >= maxPulses) {
      const same = recentPulses.findLast(p => p.population === population);
      if (same) { same.gain = Math.min(1, same.gain + gain * .2); same.usd += e.usd; same.sourceTxs.push(...e.sourceTxs); }
      continue;
    }
    // Escape and recovery cannot be replaced by feeding in the same frame.
    if (e.ts < lockedUntil) { entry.motor = transitions.filter(t => t.ts <= e.ts).at(-1)?.motor || 'recover'; }
    else {
      // New input supersedes a pending lower-priority recovery schedule.
      while (transitions.at(-1)?.ts > e.ts) transitions.pop();
      append(e.ts, entry.motor);
      if (looming) {
        lastEscape = e.ts; lockedUntil = e.ts + 1800;
        append(e.ts + 650, 'recover'); append(lockedUntil, 'idle');
      } else if (large && e.side === 'buy') {
        append(e.ts + 650, 'feed'); append(e.ts + 2200, 'idle');
      } else append(e.ts + (e.side === 'fee' ? 400 : 850), 'idle');
    }
    log.push(entry);
  }
  if (log.length) append(log.at(-1).ts + 30000, 'groom');
  return { version: 1, source: 'demo', duration: DURATION, events: log, transitions: transitions.sort((a, b) => a.ts - b.ts) };
}
export function stateAt(session, time) {
  const transition = session.transitions.findLast(t => t.ts <= time) || { motor: 'idle', ts: 0 };
  return { ...transition, age: time - transition.ts, event: session.events.findLast(e => e.ts <= time) };
}
