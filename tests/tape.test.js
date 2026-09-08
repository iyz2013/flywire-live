import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoTrades, ingestPons, stateAt, selectedCells } from '../src/tape.js';
const event = (tx, ts, side, usd, extra = {}) => ({ tx, ts, side, usd, success: true, ...extra });
test('demo logs exclusive feed, escape, recover and idle states', () => {
  const log = ingestPons(demoTrades);
  assert.equal(log.events.length, 9);
  assert.equal(stateAt(log, 17300).motor, 'feed');
  assert.equal(stateAt(log, 20700).motor, 'escape');
  assert.equal(stateAt(log, 21400).motor, 'recover');
  assert.equal(stateAt(log, 22700).motor, 'idle');
  const idleFrames = Array.from({ length: 1500 }, (_, i) => stateAt(log, i * 20).motor).filter(s => s === 'idle').length;
  assert.ok(idleFrames / 1500 > .65);
});
test('rejects dust, failed transactions, invalid values and deduplicates hashes', () => {
  const trade = event('a', 10, 'buy', 20);
  const log = ingestPons([trade, trade, event('b', 20, 'sell', .5), event('c', 30, 'buy', 100, { success: false }), event('d', 40, 'buy', NaN)]);
  assert.equal(log.events.length, 1);
});
test('nets opposite trades from the same trader within 300ms', () => {
  const log = ingestPons([event('a', 100, 'buy', 20, { trader: 'one' }), event('b', 300, 'sell', 18, { trader: 'one' })]);
  assert.equal(log.events.length, 1); assert.equal(log.events[0].usd, 2); assert.equal(log.events[0].side, 'buy');
  assert.deepEqual(log.events[0].sourceTxs, ['a', 'b']);
});
test('same-class overloads coalesce at eight pulses a second', () => {
  const log = ingestPons(Array.from({ length: 400 }, (_, i) => event(String(i), i, 'fee', 2)));
  assert.equal(log.events.length, 8);
  assert.equal(log.events.reduce((n, e) => n + e.sourceTxs.length, 0), 400);
  assert.ok(log.events.every(e => e.gain <= 1 && e.motor !== 'escape'));
});
test('escape cannot stack, and a buy cannot interrupt recovery', () => {
  const log = ingestPons([...demoTrades.filter(e => e.ts <= 20500), event('buy-during-escape', 20700, 'buy', 1000), event('second-sell', 20900, 'sell', 1500)]);
  assert.equal(log.events.filter(e => e.population === 'Looming / LC4').length, 1);
  assert.equal(stateAt(log, 20800).motor, 'escape');
  assert.equal(stateAt(log, 21600).motor, 'recover');
});
test('session serialization and seeded selections replay exactly', () => {
  const original = ingestPons(demoTrades), stored = JSON.parse(JSON.stringify(original));
  assert.deepEqual(original, ingestPons(demoTrades));
  for (let ms = 0; ms < 30000; ms += 20) assert.deepEqual(stateAt(original, ms), stateAt(stored, ms));
  const cells = Array.from({ length: 250 }, (_, i) => i);
  assert.deepEqual(selectedCells(cells, 'demo-1'), selectedCells(cells, 'demo-1'));
  assert.notDeepEqual(selectedCells(cells, 'demo-1'), selectedCells(cells, 'demo-2'));
});
