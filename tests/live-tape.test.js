import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeAbiParameters, parseAbiParameters } from 'viem';
import { decodeSwap } from '../server/live-tape.js';
const parameters = parseAbiParameters('int128, int128, uint160, uint128, int24, uint24');
const pair = { baseToken: { address: '0x4000000000000000000000000000000000000000' }, quoteToken: { address: '0x0000000000000000000000000000000000000000' }, pairAddress: 'pool' };
const log = (a,b) => ({ data: encodeAbiParameters(parameters,[a,b,1n,1n,0,0]), transactionHash:'0x1234',logIndex:'0x1',blockNumber:'0x10',blockHash:'0xabcd' });
test('v4 positive token delta is a buy, negative token delta is a sell', () => {
  const buy = decodeSwap(log(-(10n**18n), 1000n*10n**18n), pair, 18,18,2500,1000);
  assert.equal(buy.side,'buy'); assert.equal(buy.usd,2500); assert.equal(buy.price,2.5); assert.equal(buy.fee_usd,null);
  const sell = decodeSwap(log(10n**18n,-1000n*10n**18n),pair,18,18,2500,1000);
  assert.equal(sell.side,'sell'); assert.equal(sell.usd,2500);
});
test('currency ordering and non-18-decimal quote assets decode correctly', () => {
  const inverse = { ...pair, quoteToken:{address:'0xf000000000000000000000000000000000000000'} };
  const result = decodeSwap(log(10n**18n,-2000000n),inverse,18,6,1,1000);
  assert.equal(result.side,'buy'); assert.equal(result.usd,2); assert.equal(result.price,2); assert.equal(result.block,16);
});
