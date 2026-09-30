import assert from 'node:assert/strict';
import {BRANCH_DEFAULTS,simulateBranch,queueCount} from '../static/branch/model.mjs';
const p={...BRANCH_DEFAULTS,battery:8};const a=simulateBranch(p);
assert.equal(a.rows.length,6);assert.equal(a.target.branch,'D');
for(const batch of a.batches){const branch=batch.station.includes('E')?'E':'D';assert.ok(batch.flights.every(id=>p.branches[id]===branch));assert.ok(batch.boarded<=batch.capacity)}
const blockedD=simulateBranch({...p,localProbabilityC:1,target:3});
assert.ok(blockedD.rows.filter(r=>r.branch==='D').every(r=>r.departC===null));assert.ok(blockedD.rows.filter(r=>r.branch==='E').some(r=>r.departC!==null));
assert.equal(blockedD.target.branch,'E');assert.ok(blockedD.economics.energy>0);
assert.ok(a.rows.filter(r=>r.destination!=='B').every(r=>r.departHub===null));
const changedE=simulateBranch({...p,localProbabilityCE:1});
assert.deepEqual(a.rows.filter(r=>r.branch==='D'),changedE.rows.filter(r=>r.branch==='D'));
assert.equal(queueCount(a,'D','C',19),2);
const economics=a.economics;assert.ok(Math.abs(economics.net-(economics.revenue-economics.timeCost-economics.handling-economics.fixed-economics.energy*economics.p.energyPrice))<1e-9);
assert.throws(()=>simulateBranch({...p,branches:['E','E','D','E','D','E']}));
assert.throws(()=>simulateBranch({...p,ce:-1}));
assert.deepEqual(a.batches,simulateBranch(p).batches);
console.log('Branch separation, zero-slot isolation, terminal exits, E target economics, seeded replay and invalid routes passed');

