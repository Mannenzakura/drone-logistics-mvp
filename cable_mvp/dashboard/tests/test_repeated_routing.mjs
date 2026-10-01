import assert from 'node:assert/strict';
import {BRANCH_DEFAULTS,chooseBranch,simulateBranch} from '../static/branch/model.mjs';
import {repeatBranch,observePlan,quantile,proportionCI} from '../static/branch/repeated.mjs';
assert.equal(quantile([1,2,3,100]),100);assert.equal(quantile([]),null);assert.equal(proportionCI([0]).low,null);
const base=chooseBranch(BRANCH_DEFAULTS);assert.equal(base.target.branch,'E');assert.equal(base.routeComparison.length,2);
const manual=chooseBranch({...BRANCH_DEFAULTS,routeMode:0});assert.equal(manual.target.branch,'D');
for(const mode of [1,2,3]){const v=chooseBranch({...BRANCH_DEFAULTS,routeMode:mode});const c=v.routeComparison.filter(x=>x.feasible);const winner=v.routeComparison.find(x=>x.selected);assert.ok(c.every(x=>mode===1?winner.net>=x.net:mode===2?winner.arrivalB<=x.arrivalB:winner.energy<=x.energy));}
const blocked=chooseBranch({...BRANCH_DEFAULTS,departuresCE:[0],routeMode:1});assert.equal(blocked.target.branch,'D');assert.equal(blocked.routeComparison.find(x=>x.branch==='E').feasible,false);
assert.throws(()=>chooseBranch({...BRANCH_DEFAULTS,capacityMode:0,seatsC:0}));
const other=simulateBranch({...BRANCH_DEFAULTS,branches:BRANCH_DEFAULTS.branches.map((b,i)=>i===2?'E':b)});
for(const b of manual.batches){const x=other.batches.find(x=>x.station===b.station&&x.time===b.time);assert.equal(x.local,b.local);assert.deepEqual(x.localArrivalTimes,b.localArrivalTimes);}
const same=simulateBranch(base.p,base.economics);assert.deepEqual(same.rows,base.rows);assert.ok(Math.abs(same.economics.net-base.economics.net)<1e-9);
const a=repeatBranch(base,{runs:100,seed:24}),b=repeatBranch(base,{runs:100,seed:24});assert.deepEqual(a,b);assert.equal(a.target.arrivedB,99);assert.equal(a.target.feasible,92);
assert.ok(new Set(a.trials.map(t=>t.seed)).size===100);assert.ok(a.rows.every(r=>r.arrived===r.served+r.unserved));assert.ok(a.rows.some(r=>r.unserved>0));assert.ok(a.rows.every(r=>r.meanWait===null||r.lowerMean>=0));
const fixed=chooseBranch({...BRANCH_DEFAULTS,capacityMode:0,battery:8,seatsC:5,seatsD:5});const noRandom=repeatBranch(fixed,{runs:3});assert.ok(noRandom.trials.every(t=>t.arrivalB===noRandom.trials[0].arrivalB));
assert.throws(()=>repeatBranch(base,{runs:0}));assert.throws(()=>repeatBranch(base,{seed:-1}));
const hand={batches:[{station:'C→D',time:10,localArrivalTimes:[0,1,9],localServedTotal:2,localWaits:[4,3]},{station:'C→E',time:10},{station:'D→B',time:20},{station:'E→B',time:20}],rows:[{branch:'D',destination:'B',arrivalC:2,departC:null,arrivalHub:null,departHub:null},{branch:'D',destination:'B',arrivalC:11,departC:null,arrivalHub:null,departHub:null}]};
const obs=observePlan(hand);assert.equal(obs['C→D 本地'].unserved,1);assert.equal(obs['C→D 本地'].lowerWaitSum,8);assert.equal(obs['C→D 中转'].unserved,1);assert.equal(obs['C→D 中转'].afterCutoff,1);assert.equal(obs['C→D 中转'].lowerWaitSum,8);
console.log('Route objective, infeasible alternative, common random streams, fixed-policy replay, 100-run reproducibility, censoring and queue conservation passed');
