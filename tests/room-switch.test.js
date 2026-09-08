import test from 'node:test';
import assert from 'node:assert/strict';
import {NeuralRuntime} from '../src/neural-runtime.js';
test('neural reset blocks stepping until reset completes and advances generation',()=>{
 const sent=[];let cleared=0;
 const runtime=Object.assign(Object.create(NeuralRuntime.prototype),{view:{reset(){cleared++;}},ready:true,pending:true,generation:2,worker:{postMessage:m=>sent.push(m)}});
 runtime.reset();assert.equal(cleared,1);assert.equal(runtime.generation,3);assert.equal(runtime.resetting,true);
 runtime.step();runtime.pulse([1],.5);assert.deepEqual(sent,[{type:'reset',generation:3}]);
 runtime.resetting=false;runtime.pending=false;runtime.step();assert.equal(sent.at(-1).generation,3);
});
