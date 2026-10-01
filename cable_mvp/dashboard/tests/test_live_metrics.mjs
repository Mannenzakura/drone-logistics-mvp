import assert from 'node:assert/strict';
import {simulateBranch,BRANCH_DEFAULTS} from '../static/branch/model.mjs';
import {liveMetrics} from '../static/branch/live_metrics.mjs';
for(const target of [2,3])for(const winchTiming of [0,1]){
 const plan=simulateBranch({...BRANCH_DEFAULTS,target,winchTiming,battery:8});const e=plan.economics;
 const initial=liveMetrics(e,0),end=liveMetrics(e,e.target.arrivalB),waiting=liveMetrics(e,(e.target.arrivalC+e.target.departC)/2);
 assert.equal(initial.revenue,0);assert.equal(initial.energy,0);assert.ok(waiting.energy>initial.energy);
 for(const key of ['energy','net','revenue','timeCost','handling','fixed'])assert.ok(Math.abs(end[key]-e[key])<1e-8,key+': '+end[key]+' vs '+e[key]);
 assert.ok(Math.abs(end.mass-(e.p.q+e.lD))<1e-8);assert.ok(end.goods.every(g=>g.delivered===g.kg));
 const samples=Array.from({length:30},(_,i)=>liveMetrics(e,e.target.arrivalB*i/29));assert.ok(samples.every((v,i)=>!i||v.energy>=samples[i-1].energy-1e-9));
}
console.log('D/E live ledger, simplified/height winch, monotone energy and final plan reconciliation passed');
