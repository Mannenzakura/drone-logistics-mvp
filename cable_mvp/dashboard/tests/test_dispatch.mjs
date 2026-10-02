import assert from 'node:assert/strict';
import {simulateFull} from '../static/branch/full_model.mjs';
import {flowSchedule} from '../static/branch/network_flow.mjs';
const base=simulateFull({}).p;
const jobs=[{id:0,origin:'C',destination:'D',branch:'D',created:0,workC:10,workHub:0,dispatchDeadline:20},{id:1,origin:'C',destination:'D',branch:'D',created:.1,workC:0,workHub:0,dispatchDeadline:5}];
const p={...base,target:-1,serviceEnabledC:0,fullJobs:jobs,batchMax:2,batchReserve:0,departuresC:[1,5,12],departuresCE:[],departuresD:[],departuresEB:[]};
const strict=flowSchedule(p),ready=flowSchedule({...p,dispatchPolicy:'ready'});assert.equal(strict.rows[1].departC,null);assert.equal(ready.rows[1].departC,1);assert.equal(ready.rows[0].departC,12);
const both={...p,fullJobs:jobs.map(j=>({...j,workC:0}))};assert.equal(flowSchedule(both).rows[0].departC,1);assert.equal(flowSchedule({...both,dispatchPolicy:'deadline'}).rows[1].departC,1);
for(const policy of ['strict','ready','deadline']){const s=flowSchedule({...p,dispatchPolicy:policy});const ids=s.batches.flatMap(b=>b.flights);assert.equal(new Set(ids).size,ids.length);for(const b of s.batches){assert.ok(b.flights.length<=1);for(const id of b.flights)assert.ok(s.rows[id].serviceEndC<=b.time)}}
assert.throws(()=>flowSchedule({...p,dispatchPolicy:'bad'}));
console.log('PASS head blocking, ready bypass, deadline order, readiness, capacity, uniqueness and default compatibility');
