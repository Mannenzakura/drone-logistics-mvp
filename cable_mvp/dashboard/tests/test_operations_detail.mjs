import assert from 'node:assert/strict';
import fs from 'node:fs';
import {replayReview} from '../static/branch/operations_detail.mjs';
import {simulateFull} from '../static/branch/full_model.mjs';
import {runOperations} from '../static/branch/operations.mjs';
import {runMedical} from '../static/branch/medical_study.mjs';
const plan=simulateFull({});
for(const[kind,report]of [['operations',runOperations(plan,{runs:2,weatherRate:0,faultRate:0})],['medical',runMedical(plan,{runs:2,weatherRate:0,faultRate:0})]]){
 for(const scenario of ['reference','review','stress','stressReference']){
  const original=report[scenario].trials[1],copy=structuredClone(report);for(const k of ['schedule','hours','traces','disruptions'])delete copy[scenario].trials[1][k];
  const replay=replayReview(copy,kind,scenario,1);assert.equal(replay.seed,original.seed);assert.equal(replay.schedule.rows.length,original.generated);assert.equal(replay.traces.length,original.generated);assert.equal(replay.hours.length,24);if(original.schedule)assert.deepEqual(replay.schedule,original.schedule);if(kind==='medical')assert.ok(Math.abs(replay.net-original.net)<1e-8);
 }
}
const saved=JSON.parse(fs.readFileSync(new URL('../medical-validation.json',import.meta.url),'utf8'));const t=replayReview(saved,'medical','review',1);assert.ok(Math.abs(t.net-saved.review.trials[1].net)<1e-8);assert.equal(t.completed,saved.review.trials[1].completed);assert.equal(t.traces.length,t.generated);assert.throws(()=>replayReview(saved,'medical','review',999),/样本/);
console.log('PASS compact-report per-seed replay restores 24 hours and all aircraft, four scenarios, exact operations chronology and medical ledger, saved sample parity and missing sample guard');
