import assert from 'node:assert/strict';
import {optimizeFour,FOUR_DEFAULTS,evaluateFour} from '../static/four_model.mjs';
import {fourStudies,fourRisks} from '../static/four_studies.mjs';
const p=optimizeFour(FOUR_DEFAULTS),s=fourStudies(p);
assert.equal(s.winch.length,225);assert.equal(s.formation.length,225);
for(const cell of s.winch){if(cell.best){const b=evaluateFour(p.p,cell.dC,cell.lC,cell.best.lD);assert.ok(Math.abs(b.net-cell.best.net)<1e-8);assert.ok(b.workC+p.p.joinBuffer<=b.target.waitC+1e-8)}}
for(const cell of s.formation){if(cell.solo){assert.ok(cell.solo.waitC>=0);assert.ok(cell.solo.waitD>=0)}if(cell.delta!==null)assert.ok(Math.abs(cell.delta-(cell.formation.net-cell.solo.net))<1e-8)}
assert.equal(s.fifo.length,p.schedule.rows.length);
assert.ok(s.fifo.every(r=>r.arrivalD===null||Math.abs(r.arrivalD-r.departC-p.p.cd/p.p.speed*60)<1e-8));
const solo=evaluateFour({...FOUR_DEFAULTS,role:0,soloIndependent:1},0,0,0);
assert.equal(solo.target.waitC,0);assert.equal(solo.target.waitD,0);
assert.equal(solo.formationSaving,0);
const quiet=fourRisks(p,{arrivalJitter:0,serviceJitterC:0,transitJitter:0,serviceJitterD:0,cancelChance:0,trials:5});
assert.equal(quiet.summary.completed,5);
assert.equal(quiet.summary.viable,5);
assert.ok(quiet.sample.rows.every(v=>Math.abs(v.deltaB)<1e-8));
assert.ok(Math.abs(quiet.sample.net-p.net)<1e-8);
const disturbed=fourRisks(p,{seed:317,trials:100,arrivalJitter:4,serviceJitterC:3,transitJitter:2,serviceJitterD:3,cancelChance:.12});
assert.deepEqual(disturbed,fourRisks(p,{seed:317,trials:100,arrivalJitter:4,serviceJitterC:3,transitJitter:2,serviceJitterD:3,cancelChance:.12}));
assert.ok(disturbed.summary.completed<100||disturbed.summary.late>0);
assert.equal(disturbed.summary.viable+disturbed.summary.overBattery,disturbed.summary.completed);
assert.ok(disturbed.sample.rows.every(v=>v.arrivalD===null||v.departC!==null&&v.arrivalD>=v.departC));
const reservedPlan=optimizeFour({...FOUR_DEFAULTS,energyReserve:.2});
const reservedRisk=fourRisks(reservedPlan);
assert.ok(reservedRisk.summary.viable>fourRisks(p).summary.viable);
console.log('Four-station studies: 225 winch and 225 fair-comparison cells, FIFO propagation passed.');
