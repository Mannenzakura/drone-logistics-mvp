import assert from 'node:assert/strict';
import {serveLocalQueue,generateLocalArrivals,localAtTime} from '../static/local_queue.mjs';
import {simulateBranch,BRANCH_DEFAULTS} from '../static/branch/model.mjs';
const times=[{time:4},{time:8},{time:12}];const a=serveLocalQueue([1,2,3,4,5,6],times,3,0);
assert.deepEqual(a.map(b=>b.localBacklog),[2,2,0]);assert.deepEqual(a.map(b=>b.localServed),[2,2,2]);
const cancelled=serveLocalQueue([1,2,3,4,5,6],[{time:4,cancelled:true},{time:8},{time:12}],3,0);assert.deepEqual(cancelled.map(b=>b.localBacklog),[4,4,2]);assert.equal(cancelled[0].localServed,0);
assert.equal(localAtTime(a,6).backlog,4);assert.equal(localAtTime(a,12).served,6);
assert.deepEqual(generateLocalArrivals(24,1,0,30),generateLocalArrivals(24,1,0,30));assert.deepEqual(generateLocalArrivals(24,0,0,30),[]);
const p=simulateBranch({...BRANCH_DEFAULTS,localRateC:0,localRateD:0});assert.ok(p.batches.filter(b=>b.station.includes('D')).every(b=>b.capacity===9));
for(const b of simulateBranch(BRANCH_DEFAULTS).batches){assert.equal(b.localArrived,b.localServedTotal+b.localBacklog);assert.equal(b.capacity+b.local+b.reserved,b.plannedSize)}
console.log('Arrival reproducibility, zero rate, backlog carryover, cancellation carryover and conservation passed');
