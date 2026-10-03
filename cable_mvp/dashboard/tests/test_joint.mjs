import assert from 'node:assert/strict';
import {simulateFull} from '../static/branch/full_model.mjs';
import {jointStudy,evaluateJoint} from '../static/branch/joint.mjs';
import {generateDemand} from '../static/branch/random_demand.mjs';
const p=simulateFull({}),r=jointStudy(p,{surfaceModel:0,reliability:.7});assert.equal(r.coarseCount,216);assert.ok(r.candidates.length>216);assert.deepEqual(r,jointStudy(p,{surfaceModel:0,reliability:.7}));assert.equal(new Set([...r.seeds,...r.validationSeeds,p.p.batchSeed]).size,201);
for(const c of r.candidates){assert.equal(c.passed,c.interval.low>=r.options.reliability);assert.ok(c.dC<=2&&c.lC<=2&&c.lHub<=2);assert.equal(c.runs,100);}
const eligible=r.candidates.filter(c=>c.passed);assert.equal(r.selected.meanObjective,Math.max(...eligible.map(c=>c.meanObjective)));assert.equal(r.recommendation!==null,r.jointReview.passed);
const bg=generateDemand({...p.p,batchSeed:r.seeds[0]}),before=JSON.stringify(bg),e=evaluateJoint(p.p,p.target,bg,{branch:'D',dC:0,lC:0,lHub:0});assert.equal(JSON.stringify(bg),before);if(e){assert.equal(e.target.created,p.target.created);assert.equal(e.p.q,p.target.weight);assert.equal(e.p.fullJobs.length,bg.length+1);assert.ok(e.energy<=p.p.battery-p.p.energyReserve);}
const impossible=jointStudy(p,{surfaceModel:0,deadline:1,maxDrop:0,maxLoadC:0,maxLoadHub:0,runs:10});assert.equal(impossible.selected,null);assert.ok(impossible.candidates.every(c=>Number.isFinite(c.meanObjective)));assert.equal(impossible.validation,null);
const boundary=jointStudy(p,{surfaceModel:0,reliability:1,runs:10,maxDrop:0,maxLoadC:0,maxLoadHub:0});assert.equal(boundary.recommendation,null);
assert.throws(()=>jointStudy(p,{surfaceModel:0,step:0}));assert.throws(()=>jointStudy(p,{surfaceModel:0,maxDrop:10,maxLoadC:10,maxLoadHub:10,step:.1}));assert.throws(()=>jointStudy(simulateFull({sourceRateA:0})));
const permissive=jointStudy(p,{surfaceModel:0,reliability:0,runs:10,maxDrop:0,maxLoadC:0,maxLoadHub:0});assert.ok(permissive.validation);assert.equal(permissive.validation.trials.length,10);
console.log('PASS joint enumeration, shared samples, immutable tagged mission, disjoint holdout, conservative threshold, objective and infeasible boundaries');

assert.equal(new Set([...r.seeds,...r.validationSeeds,...r.improvementSeeds,p.p.batchSeed]).size,301);
assert.equal(r.sensitivity.length,5);
if(r.improvementReview){const v=r.improvementReview;assert.deepEqual(v.result.trials.map(t=>t.seed),r.improvementSeeds);assert.deepEqual(v.baseline.trials.map(t=>t.seed),r.improvementSeeds);assert.ok(Math.abs(v.pairedGain-(v.result.meanObjective-v.baseline.meanObjective))<1e-8);assert.equal(v.recommended,v.result.passed&&v.gainInterval.low>0);}
assert.equal(jointStudy(p,{surfaceModel:0,refine:0}).candidates.length,216);
console.log('PASS bounded refinement, three disjoint seed sets, paired fresh review and fixed-policy sensitivity');
