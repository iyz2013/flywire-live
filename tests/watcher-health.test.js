import test from 'node:test';
import assert from 'node:assert/strict';
import {streamHealthy} from '../server/streaming-tape.js';
test('live health requires both subscriptions, an open socket and a fresh head',()=>{
 const healthy={updatedAt:1000,readyState:1,ackHeads:true,ackLogs:true};
 assert.equal(streamHealthy(healthy,2000),true);
 for(const patch of [{ackLogs:false},{ackHeads:false},{readyState:3},{updatedAt:0}])assert.equal(streamHealthy({...healthy,...patch},2000),false);
 assert.equal(streamHealthy(healthy,22000),false);
});
