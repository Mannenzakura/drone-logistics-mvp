import {winchTimes,effectivePayload} from '../four_model.mjs?v=20261004-network29';
// Only the observed snapshot is accepted: unpublished future arrivals are absent.
export function chooseOnline(p,job,observed,now,o={}){
 if(job.destination!=='B'||!['A','C'].includes(job.origin))return null;
 const original={branch:job.branch,dropC:job.dropC??0,loadC:job.loadC??0,loadHub:job.loadHub??0},choices=[];
 for(const branch of ['D','E'])for(const fraction of [0,.5,1]){
  const d=original.dropC*fraction,l=original.loadC*fraction,h=original.loadHub*fraction,t=winchTimes(p,d,l,h),cd=branch==='D'?p.fullCD??p.cd:p.fullCE??p.ce,db=branch==='D'?p.fullDB??p.db:p.fullEB??p.eb,ac=job.origin==='A'?p.ac:0;
  const workC=job.origin==='A'?t.workC:job.workC,workHub=t.workD,queued=observed.filter(r=>r.station==='C'&&['queued','working'].includes(r.state)),queueMinutes=queued.reduce((a,r)=>a+(r.state==='working'?Math.max(0,(r.serviceStartC??now)+r.workC-now):r.workC),0)/Math.max(1,p.serviceServersC),arrivalC=now+ac/p.speed*60+(ac?(o.takeoffMinutes??.5):0),readyC=arrivalC+queueMinutes+workC+(o.landingMinutes??.5)+(o.takeoffMinutes??.5),next=(times,ready)=>times.find(x=>x>=ready),departC=next(branch==='D'?p.departuresC:p.departuresCE,readyC);
  const arrivalHub=departC==null?Infinity:departC+cd/p.speed*60,readyHub=arrivalHub+workHub+(o.landingMinutes??.5)+(o.takeoffMinutes??.5),departHub=next(branch==='D'?p.departuresD:p.departuresEB,readyHub),arrival=departHub==null?Infinity:departHub+db/p.speed*60+(o.landingMinutes??.5),energy=ac*(p.k0+p.kLoad*(job.weight+d))+cd*(p.k0+p.kLoad*(job.weight+l))+db*(p.k0+p.kLoad*(job.weight+h))+Math.max(0,queueMinutes)*p.loiterRate+(o.takeoffEnergy??.04)*3+(o.landingEnergy??.03)*3;
  const payload=job.weight+Math.max(d,l,h),valid=arrival<=(job.dispatchDeadline??1530)&&payload<=effectivePayload({...p,ac,cd,db})&&Math.max(d,l,h)<=p.bay&&(!p.winchEnabled||Math.max(d,l,h)<=p.winchCapacity)&&(p.allowExtrapolation||ac+cd+db<=p.referenceRange)&&((p.chargeSlots??0)>0||energy<=p.battery-p.energyReserve);
  const fee=job.feeFactor??1,revenue=fee*(job.weight*p.feeQ+d*p.feeDropC+l*p.feeLoadC+h*p.feeLoadD),cost=energy*p.energyPrice+job.weight*p.handlingQ+d*p.handlingDropC+l*p.handlingLoadC+h*p.handlingLoadD+(workC>0?p.fixedCostC:0)+(workHub>0?p.fixedCostD:0)+job.weight*p.timeQ*Math.max(0,arrival-now),score=revenue-cost;
  choices.push({branch,dropC:d,loadC:l,loadHub:h,workC,workHub,predictedArrival:arrival,predictedEnergy:energy,score,valid});
 }
 choices.sort((a,b)=>Number(b.valid)-Number(a.valid)||b.score-a.score||a.predictedArrival-b.predictedArrival);
 const selected=choices.find(x=>x.valid)??null;return {selected,choices,observedCount:observed.length,time:now,reason:selected?'基于已知队列和公开班次的保守启发式':'预测无可行候选，保留原任务；由实际事件约束判定'};
}
