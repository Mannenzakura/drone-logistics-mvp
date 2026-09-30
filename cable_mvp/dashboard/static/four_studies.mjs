import {evaluateFour,scheduleFour,routeDistance,cruiseFour} from './four_model.mjs?v=20260930-random2';
const safe=(p,d,c,l)=>{try{return evaluateFour(p,d,c,l)}catch{return null}};
const summary=r=>r?{net:r.net,energy:r.energy,dC:r.dC,lC:r.lC,lD:r.lD,departC:r.target.departC,departD:r.target.departD,arrivalD:r.target.arrivalD,waitC:r.target.waitC,waitD:r.target.waitD}:null;
export function fourStudies(plan,options={}){
  const p=plan.p,n=15;
  const distanceMax=Number(options.distanceMax??Math.max(110,routeDistance(p))),payloadMax=Number(options.payloadMax??p.payloadLimit);
  if(!Number.isFinite(distanceMax)||distanceMax<=0||distanceMax>500||!Number.isFinite(payloadMax)||payloadMax<=0||payloadMax>100)throw new Error('扫描上限须为距离 0–500 km、固定货量 0–100 kg（不含 0）');
  const base=safe(p,0,0,0),winch=[];
  // Every cell optimizes D→B cargo on the same discrete grid as the main mission.
  const lMax=Math.min(p.demandLoadD,p.bay,p.winchEnabled?p.winchCapacity:Infinity);
  const count=Math.ceil(lMax/p.step);
  if(count>500)throw new Error('扫描步长过细，请提高主模型货量搜索步长');
  const loads=Array.from({length:count+1},(_,i)=>Math.min(lMax,i*p.step));
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const dC=p.demandDropC*x/(n-1),lC=p.demandLoadC*y/(n-1);let best=null;
    for(const lD of loads){const r=safe(p,dC,lC,lD);if(r&&(!best||r.net>best.net))best=r}
    const delta=best&&base?best.net-base.net:null;
    winch.push({x,y,dC,lC,best:summary(best),delta,code:!best?0:delta===null?3:delta>1e-8?2:1});
  }
  const formation=[],total=routeDistance(p);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const distance=distanceMax*(x+1)/n,q=payloadMax*y/(n-1),scale=distance/total;
    const params={...p,q,ac:p.ac*scale,cd:p.cd*scale,db:p.db*scale,de:p.de*scale,eb:p.eb*scale};
    const f=safe(params,plan.dC,plan.lC,plan.lD);
    const s=safe({...params,role:0,soloIndependent:1},plan.dC,plan.lC,plan.lD);
    const delta=f&&s?f.net-s.net:null;
    formation.push({x,y,distance,q,formation:summary(f),solo:summary(s),delta,code:!f&&!s?0:f&&!s?1:!f&&s?2:delta>1e-8?3:4});
  }
  const baseline=scheduleFour(p,0,0),actual=plan.schedule;
  const fifo=actual.rows.map(r=>{
    const b=baseline.rows.find(v=>v.id===r.id);
    return {...r,baselineC:b.departC,baselineD:b.departD,baselineE:b.departE,delayC:r.departC===null||b.departC===null?null:r.departC-b.departC,delayD:r.departD===null||b.departD===null?null:r.departD-b.departD,delayE:r.departE===null||b.departE===null?null:r.departE-b.departE};
  });
  const end=Math.max(...actual.rows.flatMap(r=>[r.departC??0,r.departD??0]),...p.departuresD,...(p.stationCount===5?p.departuresE:[]));
  const timeline=Array.from({length:61},(_,i)=>{const time=end*i/60;return {time,c:actual.rows.filter(r=>r.arrivalC<=time&&(r.departC===null||r.departC>time)).length,e:actual.rows.filter(r=>r.destination==='B'&&r.arrivalE!==null&&r.arrivalE<=time&&(r.departE===null||r.departE>time)).length,d:actual.rows.filter(r=>r.destination!=='D'&&r.arrivalD!==null&&r.arrivalD<=time&&(r.departD===null||r.departD>time)).length}});
  return {n,winch,formation,fifo,timeline,distanceMax,payloadMax,base:summary(base),risks:fourRisks(plan,options.risks)};
}

// Keep cargo decisions fixed. Every trial perturbs arrivals, handling and C→D transit,
// then boards both stations afresh in FIFO order. All random values are reproducible.
export function fourRisks(plan,input={}){
  const p=plan.p,o={seed:24,trials:100,arrivalJitter:2,serviceJitterC:2,transitJitter:2,serviceJitterD:2,cancelChance:.05,...input};
  for(const key of ['arrivalJitter','serviceJitterC','transitJitter','serviceJitterD'])if(!Number.isFinite(o[key])||o[key]<0||o[key]>60)throw new Error(`${key} 须为 0–60 min`);
  if(!Number.isInteger(o.seed)||o.seed<0||o.seed>2147483647||!Number.isInteger(o.trials)||o.trials<1||o.trials>1000||!Number.isFinite(o.cancelChance)||o.cancelChance<0||o.cancelChance>1)throw new Error('种子须为非负整数、试验次数 1–1000、取消概率 0–1');
  const makeRandom=seed=>{let state=(seed||1)>>>0;return ()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296}};
  const one=seed=>{
    const rand=makeRandom(seed),n=p.arrivalsC.length,travelCD=p.cd/p.speed*60,travelDB=p.db/p.speed*60;
    const flights=Array.from({length:n},(_,id)=>({id,arrivalC:p.arrivalsC[id]+rand()*o.arrivalJitter,
      serviceC:(id===p.target?plan.workC:p.backgroundServiceC[id])+rand()*o.serviceJitterC,
      transitDelay:rand()*o.transitJitter,serviceD:(id===p.target?plan.workD:p.backgroundServiceD[id])+rand()*o.serviceJitterD}));
    const tripsC=p.departuresC.map(time=>({time,cancelled:rand()<o.cancelChance}));
    const tripsD=p.departuresD.map(time=>({time,cancelled:rand()<o.cancelChance}));
    const tripsE=p.stationCount===5?p.departuresE.map(time=>({time,cancelled:rand()<o.cancelChance})):[];
    const result=scheduleFour(p,plan.workC,plan.workD,{tripsC,tripsD,tripsE,
      arrivalDelay:flights.map(f=>f.arrivalC-p.arrivalsC[f.id]),
      extraC:flights.map(f=>f.serviceC-(f.id===p.target?plan.workC:p.backgroundServiceC[f.id])),
      extraD:flights.map(f=>f.serviceD-(f.id===p.target?plan.workD:p.backgroundServiceD[f.id])),
      transitC:flights.map(f=>f.transitDelay)});
    const rows=result.rows.map(r=>{const original=plan.schedule.rows[r.id];return {...r,transitDelay:flights[r.id].transitDelay,
      deltaC:r.departC===null||original.departC===null?null:r.departC-original.departC,
      deltaD:r.departD===null||original.departD===null?null:r.departD-original.departD,
      deltaB:r.arrivalB===null||original.arrivalB===null?null:r.arrivalB-original.arrivalB};});
    const target=rows[p.target];let net=null,energy=null;
    if(target.arrivalB!==null){
      const cruise=cruiseFour(p,target,plan.dC,plan.lC,plan.lD);
      energy=cruise.eAC+cruise.eCD+cruise.eDB+plan.eHandle+p.loiterRate*(target.waitC+target.waitD+(target.waitE??0)+target.transitDelay);
      const acMinutes=p.ac/p.speed*60,baseArrival=p.arrivalsC[p.target];
      const timeCost=p.timeQ*p.q*(acMinutes+target.arrivalB-baseArrival)+p.timeDropC*plan.dC*(acMinutes+target.arrivalC-baseArrival)+
        p.timeLoadC*plan.lC*(target.arrivalD-target.arrivalC)+p.timeLoadD*plan.lD*(target.arrivalB-target.arrivalD);
      net=plan.revenue-timeCost-plan.handling-plan.fixed-p.energyPrice*energy;
    }
    return {rows,target,energy,net,cancelled:tripsC.filter(t=>t.cancelled).length+tripsD.filter(t=>t.cancelled).length+tripsE.filter(t=>t.cancelled).length,
      blocked:result.events.filter(e=>e.type==='blocked').length};
  };
  const trials=Array.from({length:o.trials},(_,i)=>one((o.seed+i*2654435761)>>>0));
  const completed=trials.filter(t=>t.target.arrivalB!==null),viable=completed.filter(t=>t.energy<=p.battery+1e-8),mean=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
  return {options:o,sample:trials[0],summary:{trials:o.trials,completed:completed.length,completionRate:completed.length/o.trials,
    viable:viable.length,viableRate:viable.length/o.trials,
    late:completed.filter(t=>t.target.deltaB>1e-8).length,meanDelayB:mean(completed.map(t=>t.target.deltaB)),
    meanNet:mean(viable.map(t=>t.net)),meanEnergy:mean(completed.map(t=>t.energy)),
    overBattery:completed.filter(t=>t.energy>p.battery+1e-8).length,
    meanCancelled:mean(trials.map(t=>t.cancelled)),meanBlocked:mean(trials.map(t=>t.blocked))}};
}
