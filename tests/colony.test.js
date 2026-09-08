import test from 'node:test';
import assert from 'node:assert/strict';
import { colonyLineup } from '../server/colony.js';
import { ColonyState } from '../src/colony-state.js';
const tokens=Array.from({length:55},(_,i)=>({address:'0x'+i.toString(16).padStart(40,'0'),symbol:'T'+i,pinned:i===0}));
const swap=(token,id,ts,side='buy')=>({token,id,tx:id,ts,side,usd:100,success:true});
test('colony contains at most fifty unique tokens and keeps the pinned home first',()=>{
  const lineup=colonyLineup([...tokens,tokens[0]]);assert.equal(lineup.length,50);assert.equal(lineup[0].address,tokens[0].address);assert.equal(new Set(lineup.map(t=>t.address)).size,50);
});
test('colony routes each swap to its own fly, ignores history, and deduplicates reconnects',()=>{
  const state=new ColonyState(1000),a=tokens[0].address,b=tokens[1].address;
  const data={tokens:tokens.slice(0,2),events:[swap(a,'old',900),swap(a,'new-a',1100),swap(b,'new-b',1100,'sell')]};
  const pulses=state.accept(data,1200);assert.equal(pulses.length,2);assert.equal(state.agents.get(a).motion.side,'buy');assert.equal(state.agents.get(b).motion.side,'sell');assert.equal(state.agents.get(a).observed,1);assert.equal(state.accept(data,1300).length,0);
  assert.notEqual(state.agents.get(a).motion,state.agents.get(b).motion);
});
test('new lineup removes departed flies without resetting the others; stale swaps do not animate',()=>{
  const state=new ColonyState(1000),a=tokens[0].address,b=tokens[1].address;
  state.accept({tokens:tokens.slice(0,2),events:[]},1200);const motion=state.agents.get(b).motion;
  const pulses=state.accept({tokens:tokens.slice(1,3),events:[swap(a,'gone',49000),swap(b,'stale',2000)]},50000);
  assert.equal(state.agents.has(a),false);assert.equal(state.agents.get(b).motion,motion);assert.equal(pulses.length,0);assert.equal(state.agents.get(b).observed,1);
  state.accept({tokens:[tokens[2],tokens[1]],events:[]},51000);
  assert.deepEqual([...state.agents.keys()],[tokens[2].address,b]);assert.equal(state.agents.get(b).motion,motion);
});
