import {effectivePayload} from '../four_model.mjs?v=20261002-network18';
// Chronological simulation. Terminated jobs release devices and never occupy a seat.
export function eventSchedule(p,workC=0,workHub=0,o={}){
 const horizon=o.deadline??90,budget=p.battery-p.energyReserve,ground=o.groundEnergyRate??.005;
 const rows=p.fullJobs.map(j=>({...j,workC:j.id===p.target?workC:j.workC,workD:j.id===p.target?workHub:j.workHub,arrivalC:null,departC:null,arrivalD:null,departD:null,arrivalB:null,completionTime:null,serviceStartC:null,serviceEndC:null,serviceStartHub:null,serviceEndHub:null,serviceQueueC:0,serviceServerC:null,waitC:null,waitD:null,energySegments:[],state:'pending',terminatedAt:null,terminationReason:null}));
 const byId=new Map(rows.map(r=>[r.id,r])),events=[],batches=[],queue=[],servers=Array.from({length:p.serviceEnabledC?p.serviceServersC:0},()=>null),agenda=[];let serial=0,now=0;
 const add=(time,priority,run)=>{if(time<=horizon+1e-9)agenda.push({time,priority,run,serial:serial++})};
 const log=(r,type,text)=>events.push({time:now,station:r.station??r.origin,type,flight:r.id,text});
 const energy=(r,t=now)=>r.energySegments.reduce((a,s)=>a+s.energy*(s.end>s.start?Math.max(0,Math.min(1,(t-s.start)/(s.end-s.start))):Number(t>=s.start)),0);
 const settle=r=>{if(r.waitStart!=null){r.energySegments.push({start:r.waitStart,end:now,energy:(now-r.waitStart)*r.waitRate});r.waitStart=null}};
 const used=r=>energy(r)+(r.waitStart!=null?(now-r.waitStart)*r.waitRate:0);
 const stop=(r,reason)=>{if(['terminated','done','flying'].includes(r.state))return;settle(r);r.terminatedAt=now;r.terminationReason=reason;r.state='terminated';log(r,'terminate',`F${r.id+1}留站终止：${reason}`);const i=servers.indexOf(r.id);if(i>=0){servers[i]=null;r.serviceInterruptedC=now;startQueued()}};
 const wait=r=>{r.waitStart=now;r.waitRate=(r.origin===r.station?ground:p.loiterRate);const token=++r.token;if(r.waitRate>0)add(now+Math.max(0,(budget-used(r))/r.waitRate),0,()=>{if(r.token===token&&r.waitStart!=null)stop(r,'备用电量门槛')})};
 const lump=(r,e)=>{if(used(r)+e>budget+1e-9){stop(r,'作业电量不足');return false}const waiting=r.waitStart!=null;settle(r);r.energySegments.push({start:now,end:now,energy:e});if(waiting)wait(r);return true};
 const complete=(r,isC)=>{if(r.state!=='working')return;r[isC?'serviceEndC':'serviceEndHub']=now;r.state='ready';log(r,'ready',`F${r.id+1}作业完成`);if(isC){const i=servers.indexOf(r.id);if(i>=0)servers[i]=null;startQueued()}else if(r.destination===r.branch){settle(r);r.state='done';r.completionTime=now;log(r,'complete',`F${r.id+1}交付完成`)}};
 const work=(r,isC,server=null)=>{const duration=isC?r.workC:r.workD;r[isC?'serviceStartC':'serviceStartHub']=now;if(isC){r.serviceServerC=server;r.serviceQueueC=now-r.arrivalC}r.state='working';if(duration>0&&!lump(r,isC?p.handlingEnergyC:p.handlingEnergyD))return;if(server!==null)servers[server]=r.id;log(r,'work',`F${r.id+1}开始作业`);if(duration===0)complete(r,isC);else add(now+duration,1,()=>complete(r,isC))};
 function startQueued(){for(let i=0;i<servers.length;i++){if(servers[i]!==null)continue;const r=queue.find(x=>x.state==='queued');if(!r)break;work(r,true,i)}}
 const arrive=(r,station)=>{r.station=station;r.state='queued';r[station==='C'?'arrivalC':'arrivalD']=now;log(r,'arrive',`F${r.id+1}到达${station}`);const isC=station==='C',duration=isC?r.workC:r.workD;if(duration>0&&(isC?p.sharedC:p.sharedD)&&(duration>(isC?p.airspaceC:p.airspaceD)||(isC?p.permitC:p.permitD)<1)){stop(r,'作业空域约束');return}wait(r);if(isC&&servers.length){queue.push(r);startQueued()}else work(r,isC)};
 const distance=(station,branch)=>station==='A'?p.ac:station==='C'?(branch==='D'?p.fullCD??p.cd:p.fullCE??p.ce):(branch==='D'?p.fullDB??p.db:p.fullEB??p.eb);
 const fly=(r,station,n)=>{const dist=distance(station,r.branch),kg=r.weight+(station==='A'?(r.dropC??0):station==='C'?(r.loadC??0):(r.loadHub??0)),x=(n-1)/n,g=1-p.chi*p.eta*(p.role===1?x:p.role===2?x*x:0),cost=dist*(p.k0+p.kLoad*kg)*g,arrival=now+dist/p.speed*60;
  if(used(r)+cost>budget+1e-9||arrival>Math.min(horizon,r.dispatchDeadline??horizon)+1e-9){stop(r,'下一航段电量或期限不足');return false}settle(r);r.token++;r.state='flying';r.energySegments.push({start:now,end:arrival,energy:cost});if(station!=='A'){r[station==='C'?'departC':'departD']=now;r[station==='C'?'formationC':'formationD']=n;r[station==='C'?'waitC':'waitD']=now-r[station==='C'?'arrivalC':'arrivalD']}
  log(r,'board',`F${r.id+1}从${station}出发`);add(arrival,1,()=>{if(station==='A')arrive(r,'C');else if(station==='C')arrive(r,r.branch);else{r.arrivalB=now;r.completionTime=now;r.state='done';r.station='B';log(r,'complete',`F${r.id+1}交付完成`)}});return true};
 for(const r of rows){r.token=0;add(r.created,1,()=>{r.station=r.origin;r.state='ready';const route={...p,ac:r.origin==='A'?p.ac:0,cd:['A','C'].includes(r.origin)?distance('C',r.branch):0,db:r.destination==='B'?distance(r.branch,r.branch):0};if(r.weight+Math.max(r.dropC??0,r.loadC??0,r.loadHub??0)>effectivePayload(route)||(!p.allowExtrapolation&&route.ac+route.cd+route.db>p.referenceRange)||Math.max(r.dropC??0,r.loadC??0,r.loadHub??0)>p.bay||(p.winchEnabled&&Math.max(r.dropC??0,r.loadC??0,r.loadHub??0)>p.winchCapacity)){stop(r,'载荷或参考航程约束');return}if(r.origin==='A')fly(r,'A',1);else arrive(r,r.origin)});add(Math.min(horizon,r.dispatchDeadline??horizon),2,()=>stop(r,'交付期限截止'))}
 const dispatch=(station,branch,times)=>times.forEach((scheduledTime,index)=>add(scheduledTime,3,()=>{
  let time=scheduledTime;if(station!=='C'&&(p.connectionHold??0)>0){const limit=Math.min(scheduledTime+p.connectionHold,(times[index+1]??Infinity)-1e-6),known=rows.filter(r=>r.state==='flying'&&r.branch===branch&&r.departC!==null&&r.departD===null).map(r=>r.energySegments.at(-1).end+r.workD+(r.id===p.target?p.joinBuffer:0)).filter(t=>t>now&&t<=limit);const ready=rows.filter(r=>r.station===station&&r.state==='ready'&&r.destination==='B').length;if(ready<p.batchMax-p.batchReserve-1&&known.length)time=Math.min(...known)}
  add(time,4,()=>{
   const candidates=rows.filter(r=>r.station===station&&r.branch===branch&&['queued','working','ready'].includes(r.state)&&(station==='C'||r.destination==='B'));
   const arrival=r=>r[station==='C'?'arrivalC':'arrivalD'],ready=r=>(r[station==='C'?'serviceEndC':'serviceEndHub']??Infinity)+(r.id===p.target?p.joinBuffer:0);
   const compare=(a,b)=>p.dispatchPolicy==='deadline'?(a.dispatchDeadline??horizon)-(b.dispatchDeadline??horizon)||arrival(a)-arrival(b):p.dispatchPolicy==='ready'?ready(a)-ready(b)||arrival(a)-arrival(b):arrival(a)-arrival(b)||a.id-b.id;
   const locals=candidates.filter(r=>r.origin===station).sort(compare),transfers=candidates.filter(r=>r.origin!==station).sort(compare),ids=[],localIds=[];let remaining=p.batchMax-p.batchReserve-1;
   for(const list of [locals,transfers])for(const r of list){if(remaining<=0)break;if(r.state!=='ready'||ready(r)>now){if((p.dispatchPolicy??'strict')==='strict')break;continue}
    // Conservative solo-flight feasibility prevents removal changing formation savings.
    const dist=distance(station,branch),kg=r.weight+(station==='C'?(r.loadC??0):(r.loadHub??0));if(used(r)+dist*(p.k0+p.kLoad*kg)>budget+1e-9||now+dist/p.speed*60>Math.min(horizon,r.dispatchDeadline??horizon)){stop(r,'下一航段电量或期限不足');continue}ids.push(r.id);if(r.origin===station)localIds.push(r.id);remaining--}
   for(const id of ids)fly(byId.get(id),station,1+ids.length);
   batches.push({station:station==='C'?`C→${branch}`:`${branch}→B`,time:now,scheduledTime,connectionDelay:now-scheduledTime,batch:index,cancelled:false,actualSize:1+ids.length,plannedSize:p.batchMax,reserved:p.batchReserve,flights:ids,localFlights:localIds,local:1+localIds.length,capacity:p.batchMax-p.batchReserve-1-localIds.length,boarded:ids.length-localIds.length,unused:remaining,waiting:transfers.filter(r=>!ids.includes(r.id)&&r.state!=='terminated').length});
  })
 }));
 dispatch('C','D',p.departuresC);dispatch('C','E',p.departuresCE);dispatch('D','D',p.departuresD);dispatch('E','E',p.departuresEB);
 while(agenda.length){agenda.sort((a,b)=>a.time-b.time||a.priority-b.priority||a.serial-b.serial);const e=agenda.shift();now=e.time;e.run()}
 now=horizon;for(const r of rows){if(!['done','terminated','pending'].includes(r.state))stop(r,'仿真结束');settle(r)}
 return {rows,batches,events:events.sort((a,b)=>a.time-b.time),eventDriven:true,horizon};
}
