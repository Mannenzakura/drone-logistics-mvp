import {assignService} from '../shared_service.mjs?v=20261002-network17';
export function flowSchedule(p,workC=0,workHub=0,options={}){
 const policy=p.dispatchPolicy??'strict';if(!['strict','ready','deadline'].includes(policy))throw new Error('未知调度规则');
 const ac=p.ac/p.speed*60,dist={D:p.fullCD??p.cd,E:p.fullCE??p.ce},lastDist={D:p.fullDB??p.db,E:p.fullEB??p.eb};
 const rows=p.fullJobs.map(j=>({...j,arrivalC:['A','C'].includes(j.origin)?j.created+(j.origin==='A'?ac:0)+(options.arrivalDelay?.[j.id]??0):null,departC:null,waitC:null,arrivalD:['D','E'].includes(j.origin)?j.created:null,departD:null,waitD:null,arrivalB:null,completionTime:null,serviceStartC:null,serviceEndC:null,serviceQueueC:0,serviceServerC:null,workC:(j.id===p.target?workC:j.workC)+(options.extraC?.[j.id]??0),workD:(j.id===p.target?workHub:j.workHub)+(options.extraD?.[j.id]??0)}));
 const cJobs=rows.filter(r=>r.arrivalC!==null),slots=p.serviceEnabledC?assignService(cJobs.map(r=>({id:r.id,arrival:r.arrivalC,work:r.workC})),p.serviceServersC):null;
 for(const r of cJobs){const x=slots?.get(r.id);r.serviceStartC=x?.start??r.arrivalC;r.serviceEndC=x?.end??r.arrivalC+r.workC;r.serviceQueueC=x?.queue??0;r.serviceServerC=x?.server??null;}
 const batches=[],events=[];
 function board(branch,station){
  const isC=station==='C',arrival=isC?'arrivalC':'arrivalD',depart=isC?'departC':'departD',origin=isC?'C':branch,times=isC?(branch==='D'?p.departuresC:p.departuresCE):(branch==='D'?p.departuresD:p.departuresEB),leg=isC?'C→'+branch:branch+'→B';
  const candidates=rows.filter(r=>r.branch===branch&&r[arrival]!==null&&(isC||r.destination==='B'));
  const local=candidates.filter(r=>r.origin===origin).sort((a,b)=>a[arrival]-b[arrival]||a.id-b.id),transfer=candidates.filter(r=>r.origin!==origin).sort((a,b)=>a[arrival]-b[arrival]||a.id-b.id);let head=0,other=0,totalLocal=0,waitSum=0;
  const ready=r=>(isC?r.serviceEndC:r.arrivalD+r.workD)+(r.id===p.target?p.joinBuffer:0);
  const promote=(list,index,time)=>{if(policy==='strict')return;const eligible=list.slice(index).filter(r=>r[arrival]<=time&&ready(r)<=time);eligible.sort((a,b)=>policy==='ready'?ready(a)-ready(b)||a[arrival]-b[arrival]||a.id-b.id:(a.dispatchDeadline??Infinity)-(b.dispatchDeadline??Infinity)||a[arrival]-b[arrival]||a.id-b.id);if(eligible.length){const at=list.indexOf(eligible[0]);[list[index],list[at]]=[list[at],list[index]]}};
  if(options.solo){for(const r of candidates){r[depart]=ready(r)-(r.id===p.target?p.joinBuffer:0);r[isC?'waitC':'waitD']=r[depart]-r[arrival];r[isC?'formationC':'formationD']=1;if(isC)r.arrivalD=r.departC+dist[branch]/p.speed*60;else{r.arrivalB=r.departD+lastDist[branch]/p.speed*60;r.completionTime=r.arrivalB}}return;}
  times.forEach((scheduledTime,index)=>{let time=scheduledTime;const cancelled=branch===p.fullSelectedBranch?(options[isC?'tripsC':'tripsD']?.[index]?.cancelled??false):false;
   if(!isC&&!cancelled&&(p.connectionHold??0)>0){
    const limit=Math.min(scheduledTime+p.connectionHold,(times[index+1]??Infinity)-1e-6),seats=p.batchMax-p.batchReserve-1;
    const nowReady=candidates.filter(r=>r[depart]===null&&r[arrival]<=time&&ready(r)<=time).length;
    const known=transfer.slice(other).filter(r=>r.departC!==null&&r.departC<=scheduledTime&&ready(r)>scheduledTime&&ready(r)<=limit);
    if(nowReady<seats&&known.length)time=Math.min(...known.map(ready));
   }
   const arrived=local.filter(r=>r[arrival]<=time).length,before=arrived-head,ids=[],localWaits=[],globalBatch=batches.length;let remaining=cancelled?0:p.batchMax-p.batchReserve-1;
   promote(local,head,time);
   while(remaining>0&&head<local.length&&local[head][arrival]<=time&&ready(local[head])<=time){const r=local[head++];r[depart]=time;ids.push(r.id);const w=time-r[arrival];localWaits.push(w);waitSum+=w;totalLocal++;remaining--;promote(local,head,time);}
   const localCount=localWaits.length,capacity=remaining;
   promote(transfer,other,time);
   while(remaining>0&&other<transfer.length&&transfer[other][arrival]<=time&&ready(transfer[other])<=time){const r=transfer[other++];r[depart]=time;ids.push(r.id);remaining--;promote(transfer,other,time);}
   const actualSize=cancelled?null:1+ids.length;
   for(const id of ids){const r=rows[id];r[isC?'waitC':'waitD']=time-r[arrival];r[isC?'formationC':'formationD']=actualSize;r[isC?'batchC':'batchD']=globalBatch;if(isC)r.arrivalD=time+dist[branch]/p.speed*60+(options.transitC?.[id]??0);else{r.arrivalB=time+lastDist[branch]/p.speed*60;r.completionTime=r.arrivalB;}events.push({time,station:leg,type:'board',flight:id,text:'F'+(id+1)+'从'+leg+'发出'});}
   batches.push({station:leg,time,scheduledTime,connectionDelay:time-scheduledTime,batch:index,cancelled,plannedSize:p.batchMax,reserved:p.batchReserve,local:cancelled?0:1+localCount,capacity,boarded:ids.length-localCount,unused:remaining,actualSize,flights:ids,localFlights:ids.slice(0,localCount),waiting:transfer.slice(other).filter(r=>r[arrival]<=time).length,localArrived:arrived,localServed:localCount,localServedTotal:totalLocal,localBacklogBefore:before,localBacklog:arrived-head,localMeanWait:totalLocal?waitSum/totalLocal:null,localWaits,localArrivalTimes:local.map(r=>r[arrival])});
  });
 }
 board('D','C');board('E','C');
 for(const r of rows.filter(r=>r.arrivalD!==null)){r.serviceStartHub=r.arrivalD;r.serviceEndHub=r.arrivalD+r.workD;if(r.destination===r.branch)r.completionTime=r.serviceEndHub;}
 board('D','D');board('E','E');
 return {rows,batches,events};
}
