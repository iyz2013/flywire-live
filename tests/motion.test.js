import test from 'node:test';
import assert from 'node:assert/strict';
import { actionPose, decoratePose } from '../src/motion.js';
import { restPose } from '../src/controller.js';
test('flight and hover take off, sustain altitude and land without a discontinuity',()=>{
 for(const action of ['flight','hover']) {
  assert.equal(actionPose(action,0).y,0);
  assert.ok(actionPose(action,3).y>2);
  assert.equal(actionPose(action,7.9).y,0);
  assert.equal(actionPose(action,8).wingOpen,0);
  let prior=actionPose(action,0);
  for(let t=.02;t<=16;t+=.02){const p=actionPose(action,t);for(const [key,value] of Object.entries(p))if(key!=='behavior')assert.ok(Number.isFinite(value));assert.ok(Math.abs(p.y-prior.y)<.12);assert.ok(p.y>=0);prior=p;}
 }
});
test('manual turns oppose each other, reverse walks backwards and grooming moves legs',()=>{
 assert.equal(actionPose('left',2).yaw,-actionPose('right',2).yaw);
 assert.ok(actionPose('retreat',2).velocity<0);
 assert.equal(actionPose('groom',2).groom,1);
 assert.equal(decoratePose(restPose(),'groom',500).groom,1);
 assert.equal(decoratePose(restPose(),'idle',500).groom,0);
});
