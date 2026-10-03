import assert from 'node:assert/strict';
import {simulateFull} from '../static/branch/full_model.mjs';
import {eventSchedule} from '../static/branch/event_network.mjs';
import {networkLedger} from '../static/branch/network_economics.mjs';
import {jointStudy,JOINT_DEFAULTS,jointOptions} from '../static/branch/joint.mjs';
const p={...simulateFull({}).p,ac:1,fullCD:1,fullCE:1,fullDB:1,fullEB:1,speed:60,battery:.05,energyReserve:0,serviceEnabledC:0,sharedC:0,sharedD:0,target:-1,departuresC:[5,8],departuresCE:[],departuresD:[10,13],departuresEB:[],batchMax:5,batchReserve:0,joinBuffer:0,groundStandby:1,energyPolicy:'charge',chargeSlots:1};
const job=(id,due=90)=>({id,origin:'A',branch:'D',destination:'B',created:0,weight:1,dropC:0,loadC:0,loadHub:0,workC:0,workHub:0,cargoType:'普通',feeFactor:1,dispatchDeadline:due});
const input={...p,fullJobs:[job(0),job(1)]},s=eventSchedule(input,0,0,{...JOINT_DEFAULTS,surfaceModel:0}),ledger=networkLedger(input,s,{...JOINT_DEFAULTS,surfaceModel:0});
assert.equal(ledger.completed,2);assert.equal(s.rows[0].chargeHistory.length,2);assert.ok(s.rows[1].chargeHistory[0].setupStart>=s.rows[0].chargeHistory[0].ended);
const no=eventSchedule({...input,energyPolicy:'terminate',chargeSlots:0},0,0,{...JOINT_DEFAULTS,surfaceModel:0});assert.ok(no.rows.every(r=>r.completionTime===null));
const f=(t,c)=>c.start===null?0:Math.max(0,Math.min(1,(Math.min(t,c.ended??t)-c.start)/(c.finish-c.start)));
for(const r of s.rows){for(let t=0;t<=90;t+=.01){const consumption=r.energySegments.reduce((a,x)=>a+x.energy*(x.end>x.start?Math.max(0,Math.min(1,(t-x.start)/(x.end-x.start))):Number(t>=x.start)),0),stored=r.chargeHistory.reduce((a,c)=>a+(c.storeEnergy??0)*f(t,c),0);assert.ok(consumption-stored>=-1e-8&&consumption-stored<=p.battery+1e-8)}
 const task=ledger.tasks.find(x=>x.id===r.id),grid=r.chargeHistory.reduce((a,c)=>a+c.gridEnergy,0),stored=r.chargeHistory.reduce((a,c)=>a+c.storeEnergy,0);assert.ok(Math.abs(task.ledger.electricity-(task.ledger.energy-stored+grid)*p.energyPrice)<1e-8);assert.ok(task.ledger.energy>p.battery);assert.equal(task.depleted,false)}
assert.equal(ledger.totals.chargingInfrastructure,90*3*.01);assert.ok(ledger.totals.chargeCost>0);assert.ok(ledger.totals.gridEnergy>0);
const net=ledger.totals.revenue-Object.entries(ledger.totals).filter(([k])=>!['revenue','energy','gridEnergy'].includes(k)).reduce((a,[,v])=>a+v,0);assert.ok(Math.abs(net-ledger.net)<1e-8);
const tight={...input,fullJobs:[job(0,6),job(1,6)]},partial=eventSchedule(tight,0,0,{...JOINT_DEFAULTS,surfaceModel:0,chargePower:.02,chargeEfficiency:1});assert.ok(partial.rows.some(r=>r.terminationReason==='充电后无可衔接班次'));const cut=networkLedger(tight,partial,{...JOINT_DEFAULTS,surfaceModel:0});assert.equal(cut.completed,0);assert.ok(cut.tasks.every(t=>t.ledger.revenue===0&&!t.depleted));
assert.throws(()=>jointOptions({chargePower:.001}));assert.throws(()=>jointOptions({chargeMaxSlots:1.5}));assert.throws(()=>jointOptions({chargeEfficiency:0}));
const study=jointStudy(simulateFull({}),{runs:20,reliability:.5});const c=study.connections.charging;assert.equal(c.results.length,7);assert.equal(new Set([...study.seeds,...study.validationSeeds,...study.improvementSeeds,...study.connections.freshSeeds,...c.seeds]).size,100);assert.ok(c.demonstration);assert.deepEqual(c.review.result.trials.map(t=>t.seed),c.review.reference.trials.map(t=>t.seed));assert.ok(c.results.every(x=>x.config.groundStandby===1));
console.log('PASS finite shared chargers, station-local queues, resumed delivery, SOC conservation, partial charging cutoff, non-duplicated electricity, infrastructure costs and fifth independent paired sample');
