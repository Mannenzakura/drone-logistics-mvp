import assert from 'node:assert/strict';
import {simulateFull,deliveredCargo} from '../static/branch/full_model.mjs';
import {repeatFull} from '../static/branch/full_repeat.mjs';
import {flowSchedule} from '../static/branch/network_flow.mjs';
import {generateDemand} from '../static/branch/random_demand.mjs';
const p=simulateFull({}),q=simulateFull({});
assert.deepEqual(p,q);assert.notDeepEqual(p.rows,simulateFull({batchSeed:42}).rows);
assert.equal(new Set(p.rows.map(r=>r.id)).size,p.rows.length);
for(const r of p.rows){
 if(['D','E'].includes(r.origin))assert.equal(r.arrivalC,null);
 if(r.departC!==null)assert.equal(r.arrivalHub,r.departC+(r.branch==='D'?p.p.cd:p.p.ce)/p.p.speed*60);
 if(r.destination===r.branch)assert.equal(r.departHub,null);
 assert.ok(deliveredCargo(r,0,p.p)<=deliveredCargo(r,p.horizon,p.p));
}
for(const b of p.batches){assert.ok(b.actualSize+p.p.batchReserve<=p.p.batchMax);assert.equal(b.flights.length+1,b.actualSize);assert.equal(b.local-1+b.boarded,b.flights.length);assert.equal(b.capacity,b.boarded+b.unused);}
const work=p.rows.filter(r=>r.serviceServerC!==null).sort((a,b)=>a.serviceStartC-b.serviceStartC);
for(const r of work){const before=work.filter(x=>x!==r&&x.serviceServerC===r.serviceServerC&&x.serviceStartC<=r.serviceStartC&&x.serviceEndC>r.serviceStartC);assert.equal(before.length,0);}
const zero={sourceRateA:0,sourceRateCD:0,sourceRateCE:0,sourceRateD:0,sourceRateE:0};
assert.equal(simulateFull(zero).rows.length,0);assert.equal(simulateFull({...zero,sourceRateD:.2}).target,null);
assert.equal(simulateFull({destinationBShare:0}).target,null);
assert.ok(simulateFull({destinationBShare:0}).networkSummary.deliveredCargo>0);
const blocked=simulateFull({batchMax:1,batchReserve:0});assert.equal(blocked.networkSummary.completed,0);assert.ok(blocked.rows.length>0);assert.equal(blocked.economics,null);
const low=simulateFull({battery:.1,energyReserve:0});assert.equal(low.economics,null);assert.equal(low.rows.length,p.rows.length);
assert.throws(()=>generateDemand({...p.p,sourceEnd:1000,sourceRateA:20}),/128/);
const canceled=flowSchedule(p.p,p.target.workC,p.target.workHub,{tripsC:p.p.departuresC.map(()=>({cancelled:true}))});assert.ok(canceled.rows.filter(r=>r.branch===p.p.fullSelectedBranch&&r.arrivalC!==null).every(r=>r.departC===null));
const result=repeatFull(p,{runs:25,seed:91});assert.deepEqual(result,repeatFull(p,{runs:25,seed:91}));assert.ok(new Set(result.trials.map(t=>t.generated)).size>1);assert.equal(result.rows.length,8);
for(const g of result.rows)assert.equal(g.arrived,g.served+g.unserved);
assert.equal(repeatFull(simulateFull(zero),{runs:2}).generated,0);
assert.equal(p.economics.dC,p.target.dropC);assert.equal(p.economics.lC,p.target.loadC);assert.equal(p.economics.lD,p.target.loadHub);
console.log('PASS full random sources, propagation, capacity, shared service, empty/unserved samples, fixed task and repeated statistics');
