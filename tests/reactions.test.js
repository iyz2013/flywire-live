import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveMotion,reactionFor } from '../src/reactions.js';
test('both trade sides choose varied actions and both turn directions',()=>{
 for(const side of ['buy','sell']){const reactions=Array.from({length:80},(_,i)=>reactionFor({tx:`sample-${i}`,side,gain:.8}));assert.equal(new Set(reactions.map(r=>r.kind)).size,5);assert.equal(new Set(reactions.map(r=>r.turn)).size,2);}
});
test('buy lifts off, sell lowers altitude, interruptions stay continuous and grounded',()=>{
 const motion=new LiveMotion();motion.trigger({tx:'one',side:'buy',gain:1});
 for(let i=0;i<100;i++)motion.advance(.02);
 const altitude=motion.pose.y;assert.ok(altitude>1.5);
 motion.trigger({tx:'two',side:'sell',gain:1});assert.equal(motion.pose.y,altitude);
 for(let i=0;i<100;i++)motion.advance(.02);
 assert.ok(motion.pose.y<altitude);
 for(let i=0;i<2000;i++){if(i%70===0)motion.trigger({tx:String(i),side:i%140?'buy':'sell',gain:.9});const before=motion.pose.y,p=motion.advance(.02);for(const [k,v]of Object.entries(p))if(k!=='behavior')assert.ok(Number.isFinite(v),k);assert.ok(p.y>=0);assert.ok(Math.abs(p.y-before)<.5);assert.ok(Math.hypot(p.x,p.z)<10);}
});
