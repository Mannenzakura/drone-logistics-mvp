import assert from 'node:assert/strict';
import {simulateFull} from '../static/branch/full_model.mjs';
import {flowSchedule} from '../static/branch/network_flow.mjs';
import {networkLedger} from '../static/branch/network_economics.mjs';
import {jointStudy,JOINT_DEFAULTS} from '../static/branch/joint.mjs';
const plan=simulateFull({}),p=plan.p,o={...JOINT_DEFAULTS,surfaceModel:0};
const jobs=[{id:0,origin:'A',branch:'D',destination:'B',created:0,weight:1,dropC:0,loadC:0,loadHub:0,workC:0,workHub:0,cargoType:'普通',feeFactor:1,dispatchDeadline:90}];
const cp={...p,fullJobs:jobs,target:-1,serviceEnabledC:0,departuresC:[17],departuresCE:[],departuresD:[30,35],departuresEB:[],batchMax:3,batchReserve:0};
const strict=flowSchedule(cp),held=flowSchedule({...cp,connectionHold:2});assert.equal(strict.rows[0].departD,35);assert.ok(held.rows[0].departD>30&&held.rows[0].departD<=32);assert.ok(held.batches.find(b=>b.station==='D→B').connectionDelay>0);
const absent=flowSchedule({...cp,departuresC:[33],connectionHold:10});assert.equal(absent.batches.find(b=>b.station==='D→B').connectionDelay,0);
const capped=flowSchedule({...cp,departuresD:[30,30.5],connectionHold:10});assert.ok(capped.batches.find(b=>b.station==='D→B').time<30.5);
const empty=networkLedger({...cp,fullJobs:[]},{rows:[],batches:[]},o);assert.equal(empty.net,-o.deadline*o.airportCostPerMinute);
const ledger=networkLedger(cp,held,o);assert.ok(ledger.completed===1);assert.ok(ledger.totals.energy>0);assert.ok(Math.abs(ledger.net-(ledger.totals.revenue-ledger.totals.timeCost-ledger.totals.handling-ledger.totals.fixed-ledger.totals.electricity-ledger.totals.penalty-ledger.totals.rescue-ledger.totals.equipment-ledger.totals.airport-ledger.totals.leader))<1e-8);
const low=networkLedger({...cp,battery:.01,energyReserve:0},held,o);assert.equal(low.completed,0);assert.ok(low.tasks[0].depleted);assert.equal(low.totals.revenue,0);
const r=jointStudy(plan,{surfaceModel:0,runs:20,reliability:.5});assert.equal(r.connections.results.length,36);assert.equal(new Set([...r.seeds,...r.validationSeeds,...r.improvementSeeds,...r.connections.freshSeeds,p.batchSeed]).size,81);
for(const x of r.connections.results.filter(x=>!x.error)){assert.ok(Number.isFinite(x.meanNet));assert.deepEqual(x.trials.map(t=>t.seed),r.validationSeeds);}
const review=r.connections.review;assert.ok(review);assert.ok(Math.abs(review.gain.mean-(review.result.meanNet-review.reference.meanNet))<1e-8);assert.deepEqual(review.result.trials.map(t=>t.seed),r.connections.freshSeeds);
console.log('PASS bounded causal holding, next-batch cap, empty-airport costs, whole-network identity, energy abort, shared exploration and fourth independent seeds');

const withLocal={...cp,eta:0,batchMax:3,fullJobs:[...jobs,{id:1,origin:'D',branch:'D',destination:'B',created:0,weight:1,dropC:0,loadC:0,loadHub:0,workC:0,workHub:0,cargoType:'普通',feeFactor:1,dispatchDeadline:90}]};
const a=networkLedger(withLocal,flowSchedule(withLocal),o),b=networkLedger({...withLocal,connectionHold:2},flowSchedule({...withLocal,connectionHold:2}),o);assert.ok(b.tasks[1].ledger.timeCost>a.tasks[1].ledger.timeCost);assert.ok(b.tasks[1].ledger.energy>a.tasks[1].ledger.energy);
console.log('PASS connection holding charges delay and energy to original local cargo');
