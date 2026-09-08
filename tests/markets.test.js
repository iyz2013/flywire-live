import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeAbiParameters,parseAbiParameters } from 'viem';
import { decodeMarketSwap,tokenAddress,HOME_TOKEN,marketFilters } from '../server/markets.js';
import { normalizeCatalog,tokenImage } from '../server/catalog.js';
import { reconcileEvents } from '../src/live-client.js';
const log={transactionHash:'0x'+'a'.repeat(64),logIndex:'0x2',blockNumber:'0xa',blockHash:'0x'+'b'.repeat(64)};
const market={token0:true,decimals:18,quoteDecimals:6,quoteUsd:1,pairAddress:'0x'+'1'.repeat(40),dexId:'uniswap'};
test('V3 uses pool perspective, with six-decimal quote and token ordering',()=>{
  const data=encodeAbiParameters(parseAbiParameters('int256,int256,uint160,uint128,int24'),[-2n*10n**18n,4000000n,1n,1n,0]);
  const e=decodeMarketSwap({...log,data},{...market,version:'v3'},1000);
  assert.equal(e.side,'buy');assert.equal(e.usd,4);assert.equal(e.price,2);
  const reversed=encodeAbiParameters(parseAbiParameters('int256,int256,uint160,uint128,int24'),[-4000000n,2n*10n**18n,1n,1n,0]);
  assert.equal(decodeMarketSwap({...log,data:reversed},{...market,version:'v3',token0:false},1000).side,'sell');
});
test('V4 caller perspective and V2 output both classify buys correctly',()=>{
  const v4=encodeAbiParameters(parseAbiParameters('int128,int128,uint160,uint128,int24,uint24'),[2n*10n**18n,-4000000n,1n,1n,0,3000]);
  assert.equal(decodeMarketSwap({...log,data:v4},{...market,version:'v4'},1000).side,'buy');
  const v2=encodeAbiParameters(parseAbiParameters('uint256,uint256,uint256,uint256'),[0n,4000000n,2n*10n**18n,0n]);
  assert.equal(decodeMarketSwap({...log,data:v2},{...market,version:'v2'},1000).usd,4);
  assert.equal(marketFilters([{...market,version:'v3'},{...market,version:'v4',pairAddress:'0x'+'2'.repeat(64)}]).length,2);
});
test('catalog pins home and returns 50 distinct most recently migrated tokens',()=>{
  const rows=Array.from({length:60},(_,i)=>({token:'0x'+(i+1).toString(16).padStart(40,'0'),graduated:true,graduatedAt:new Date(100000+i*1000).toISOString(),name:'T'+i,symbol:'T'}));
  const result=normalizeCatalog([...rows,...rows,{token:HOME_TOKEN,graduated:true,graduatedAt:new Date(0).toISOString()}]);
  assert.equal(result.length,51);assert.equal(result[0].address,HOME_TOKEN);assert.equal(result[1].name,'T59');assert.equal(result.at(-1).name,'T10');
  assert.equal(tokenImage('javascript:alert(1)'), '');assert.equal(tokenImage('ipfs://bafytest'),'https://ponsfamily.com/api/ipfs/content/bafytest?variant=card');
  assert.throws(()=>tokenAddress('../../etc/passwd'));assert.throws(()=>tokenAddress('0x1234'));
});
test('live reconciliation retains all swaps, deduplicates reconnects and removes reorgs',()=>{
  const rows=Array.from({length:20},(_,i)=>({id:'swap-'+i,tx:'same-tx',ts:1000,usd:2,side:'buy'}));
  const a=reconcileEvents(new Map(),rows,{now:1500,startedAt:1000});assert.equal(a.size,20);
  const b=reconcileEvents(a,rows,{now:2000,startedAt:1000});assert.equal(b.get('swap-1').ts,a.get('swap-1').ts);
  assert.equal(reconcileEvents(b,rows.slice(1),{now:3000,startedAt:1000}).has('swap-0'),false);
  const old=reconcileEvents(new Map(),rows,{initial:true,now:10000});assert.equal(old.get('swap-0').ts,1000);
});
