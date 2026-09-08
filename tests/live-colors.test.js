import test from 'node:test';
import assert from 'node:assert/strict';
import { writeStimulusTags, EVENT_COLORS } from '../src/event-colors.js';
import { logId } from '../server/streaming-tape.js';
import { ingestPons } from '../src/tape.js';
test('overlapping inputs keep independent buy, sell and fee colors',()=>{
 const colors=new Float32Array(12),times=new Float32Array(4).fill(-10000);
 writeStimulusTags(colors,times,[0,1],'buy',1);
 writeStimulusTags(colors,times,[1],'sell',2);
 writeStimulusTags(colors,times,[2],'fee',3);
 for(const [index,side] of [[0,'buy'],[1,'sell'],[2,'fee']]) EVENT_COLORS[side].forEach((v,k)=>assert.ok(Math.abs(colors[index*3+k]-v)<1e-6));
 assert.deepEqual([...times],[1,2,3,-10000]);
});
test('distinct logs in the same transaction survive deduplication',()=>{
 const hash='0xabc', a=logId({transactionHash:hash,logIndex:'0x1'}),b=logId({transactionHash:hash,logIndex:'0x2'});
 assert.notEqual(a,b);assert.equal(a,logId({transactionHash:hash.toUpperCase(),logIndex:1}));
 const first={id:a,tx:hash,ts:100,usd:10,side:'buy'},second={...first,id:b,ts:300,side:'sell'};
 assert.equal(ingestPons([first,first,second]).events.length,2);
});
