import assert from 'node:assert/strict';
import {simulateFull} from '../static/branch/full_model.mjs';
import {jointStudy,jointInput,JOINT_DEFAULTS} from '../static/branch/joint.mjs';
import {assessEvent} from '../static/branch/joint_event_assess.mjs';
import {eventSchedule} from '../static/branch/event_network.mjs';
import {networkLedger} from '../static/branch/network_economics.mjs';
const plan=simulateFull({}),o={...JOINT_DEFAULTS,surfaceModel:0,runs:20,reliability:.5,refine:0,maxDrop:0,maxLoadC:0,maxLoadHub:0};
const r=jointStudy(plan,{...o,surfaceModel:0});assert.equal(r.coarseCount,8);assert.equal(r.engine,'chronological-events');
assert.deepEqual(new Set(r.candidates.map(c=>c.chargeStrategy)),new Set(['none','full','next','remaining']));
assert.deepEqual(new Set(r.candidates.map(c=>c.branch)),new Set(['D','E']));
for(const c of r.candidates)assert.equal(c.chargeSlots,c.chargeStrategy==='none'?0:1);
assert.equal(r.recommendation!==null,r.jointReview?.passed??false);
if(r.jointReview){const a=r.validation.trials,b=r.jointReview.reference.trials;assert.deepEqual(a.map(t=>t.seed),b.map(t=>t.seed));assert.ok(Math.abs(r.jointReview.gain.mean-a.reduce((s,t,i)=>s+t.networkNet-b[i].networkNet,0)/a.length)<1e-8);assert.ok(r.validation.trials[0].sample.schedule.eventDriven);}
const p={...plan.p,dispatchTargetDeadline:90},mission={...plan.target,feeFactor:1.7},c={branch:'E',dC:1,lC:1,lHub:1,chargeStrategy:'next'},bg=[],before=JSON.stringify(mission);
const x=assessEvent(p,mission,[bg],[17],c,o,jointInput,true),input=jointInput({...p,groundStandby:1,chargeSlots:1,chargeStrategy:'next',energyPolicy:'charge'},mission,bg,c),schedule=eventSchedule(input,input.fullJobs[0].workC,input.fullJobs[0].workHub,o),ledger=networkLedger({...input,feeQ:p.feeQ,feeDropC:p.feeDropC,feeLoadC:p.feeLoadC,feeLoadD:p.feeLoadD},schedule,o);
assert.equal(x.trials[0].objectiveValue,ledger.tasks[0].net);assert.equal(x.trials[0].networkNet,ledger.net);assert.equal(JSON.stringify(mission),before);assert.deepEqual(bg,[]);
const off=jointStudy(plan,{surfaceModel:0,...o,chargeStudy:0});assert.equal(off.coarseCount,2);assert.deepEqual(off.strategies,['none']);assert.throws(()=>jointStudy(plan,{surfaceModel:0,jointChargeSlots:1.5}));
const low=jointStudy(simulateFull({battery:3}),{...o,reliability:0});assert.ok(low.candidates.some(c=>c.chargeStrategy!=='none'));assert.ok(low.candidates.every(c=>Number.isFinite(c.meanObjective)));
console.log('PASS joint route/cargo/charging grid, shared chronological engine, fee-factor accounting, paired holdout, immutable inputs and no-charge boundary');
