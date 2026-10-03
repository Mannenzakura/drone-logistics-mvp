import assert from 'node:assert/strict';
import {simulateFull} from '../static/branch/full_model.mjs';
import {jointStudy,jointInput,evaluateJoint} from '../static/branch/joint.mjs';
import {missionLedger} from '../static/branch/mission_ledger.mjs';
const p=simulateFull({}),c={branch:'D',dC:1,lC:1,lHub:1},input=jointInput(p.p,p.target,[],c),o={deadline:90,failurePenalty:30,rescueCost:20};
const e=evaluateJoint(p.p,p.target,[],c),good=missionLedger(input,c,o,true,e);assert.ok(Math.abs(good.net-e.net)<1e-8);
const blocked=missionLedger({...input,batchMax:1,batchReserve:0},c,o,false);assert.ok(blocked.electricity>0);assert.equal(blocked.goods.find(g=>g.name==='lHub').delivered,0);assert.ok(blocked.revenue>0);assert.equal(blocked.penalty,30);
const noLaunch=missionLedger(input,c,{...o,deadline:1},false);assert.equal(noLaunch.energy,0);assert.equal(noLaunch.revenue,0);assert.equal(noLaunch.net,-30);
const low=missionLedger({...input,battery:.1,energyReserve:0},c,o,false);assert.equal(low.depleted,true);assert.ok(low.energy<=.1);assert.equal(low.rescue,20);assert.equal(low.goods[0].delivered,0);
const r=jointStudy(p,{surfaceModel:0,reliability:.7});for(const t of r.validation.trials){const l=t.ledger;assert.ok(Math.abs(l.net-(l.revenue-l.timeCost-l.handling-l.fixed-l.electricity-l.penalty-l.rescue-l.improvement-l.chargeCost))<1e-8);if(t.success)assert.ok(Math.abs(l.net-t.net)<1e-8);}
assert.equal(r.improvements[0].result.meanObjective,r.validation.meanObjective);assert.equal(r.improvements[2].cost,8);
console.log('PASS successful endpoint parity, partial receipts, unserved costs, prelaunch cutoff, energy stop and paired improvement ledger');
