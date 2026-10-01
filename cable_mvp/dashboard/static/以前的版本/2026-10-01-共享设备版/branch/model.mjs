import {FOUR_DEFAULTS,validateFour,optimizeFour,scheduleFour} from '../four_model.mjs?v=20261001-service7';
export const BRANCH_DEFAULTS={...FOUR_DEFAULTS,capacityMode:3,serviceEnabledC:1,serviceServersC:1,backgroundServiceC:[2,2,2,2,2,2],battery:5,localRateCE:1.4,localRateEB:1.4,branches:['D','E','D','E','D','E'],destinations:['D','E','B','B','B','B'],ce:30,eb:20,departuresCE:[22,26,30,34,38,42,46],departuresEB:[40,44,48,52,56,60,64,68],localProbabilityCE:.8,localProbabilityEB:.8};
export function branchParameters(input){
 const p={...BRANCH_DEFAULTS,...input,stationCount:4};
 const n=p.arrivalsC?.length;
 if(!Number.isInteger(p.batchSeed)||p.batchSeed<0||p.batchSeed>4294967295)throw new Error('随机种子须为 0–4294967295 整数');
 if(!Array.isArray(p.branches)||p.branches.length!==n||p.branches.some(x=>!['D','E'].includes(x)))throw new Error('每架飞机的分支须为 D 或 E，数量与到达表一致');
 if(!Array.isArray(p.destinations)||p.destinations.length!==n||p.destinations.some((x,i)=>x!=='B'&&x!==p.branches[i]))throw new Error('终点须为 B 或本机经过的 D/E');
 if(!Number.isInteger(p.target)||p.target<0||p.target>=n||p.destinations[p.target]!=='B')throw new Error('目标机须为去 B 的飞机');
 if(![0,2,3].includes(p.capacityMode))throw new Error('分支原型支持 0 固定、2 独立抽样、3 连续到达模式');
 return p;
}
function subset(p,branch){
 const ids=p.branches.map((x,i)=>x===branch?i:-1).filter(i=>i>=0);const e=branch==='E';
 const q={...p,globalIdsC:ids,sharedJobsC:p.arrivalsC.map((arrival,id)=>({id,arrival,work:p.backgroundServiceC[id]})),target:Math.max(0,ids.indexOf(p.target)),stationCount:4,cd:e?p.ce:p.cd,db:e?p.eb:p.db,
 arrivalsC:ids.map(i=>p.arrivalsC[i]),backgroundServiceC:ids.map(i=>p.backgroundServiceC[i]),backgroundServiceD:ids.map(i=>p.backgroundServiceD[i]),
 destinations:ids.map(i=>p.destinations[i]===branch?'D':'B'),departuresC:e?p.departuresCE:p.departuresC,departuresD:e?p.departuresEB:p.departuresD,
 localRateC:e?p.localRateCE:p.localRateC,localRateD:e?p.localRateEB:p.localRateD,
 localProbabilityC:e?p.localProbabilityCE:p.localProbabilityC,localProbabilityD:e?p.localProbabilityEB:p.localProbabilityD,
 batchSeed:(p.batchSeed^(e?0x5e123:0x4d123))>>>0};
 return {ids,q};
}
export function simulateBranch(input){
 const p=branchParameters(input),selected=p.branches[p.target],groups={};
 for(const b of ['D','E']){const group=subset(p,b);groups[b]=group;
 // Validate even an empty branch via a dummy B-bound zero-work flight; never add it to results.
 const check={...group.q,target:0,arrivalsC:group.ids.length?group.q.arrivalsC:[0],backgroundServiceC:group.ids.length?group.q.backgroundServiceC:[0],backgroundServiceD:group.ids.length?group.q.backgroundServiceD:[0],destinations:Array(Math.max(1,group.ids.length)).fill('B')};validateFour(check);
 }
 const best=optimizeFour(groups[selected].q),rows=[],batches=[],events=[];
 for(const b of ['D','E']){
 const {ids,q}=groups[b];const schedule=b===selected?best.schedule:scheduleFour({...q,target:-1,sharedJobsC:q.sharedJobsC.map(j=>j.id===p.target?{...j,work:best.workC}:j)},0,0);
 for(const r of schedule.rows){const id=ids[r.id],terminal=p.destinations[id];rows.push({id,branch:b,destination:terminal,arrivalC:r.arrivalC,departC:r.departC,waitC:r.waitC,serviceStartC:r.serviceStartC,serviceEndC:r.serviceEndC,serviceQueueC:r.serviceQueueC,serviceServerC:r.serviceServerC,arrivalHub:r.arrivalD,departHub:r.departD,waitHub:r.waitD,arrivalB:r.arrivalB,completionTime:r.completionTime,workC:r.workC,workHub:r.workD});}
 for(const batch of schedule.batches)batches.push({...batch,station:batch.station==='C'?'C→'+b:b+'→B',flights:batch.flights.map(id=>ids[id])});
 for(const event of schedule.events)events.push({...event,station:event.station==='C'?'C→'+b:b,flight:event.flight===undefined?undefined:ids[event.flight]});
 }
 rows.sort((a,b)=>a.id-b.id);const horizon=Math.max(...p.departuresC,...p.departuresCE,...p.departuresD,...p.departuresEB,...rows.map(r=>r.completionTime??0));
 return {p,rows,batches,events,target:rows[p.target],economics:best,horizon};
}
export function queueCount(plan,branch,station,time){return plan.rows.filter(r=>{const a=station==='C'?r.arrivalC:r.arrivalHub,d=station==='C'?r.departC:r.departHub;return r.branch===branch&&(station==='C'||r.destination!==branch)&&a!==null&&a<=time&&(d===null||d>time)}).length;}
