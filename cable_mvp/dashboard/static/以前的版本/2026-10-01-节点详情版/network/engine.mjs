// Small, auditable two-transfer queue simulation. Times are minutes on one clock.
export const EXAMPLE = Object.freeze({
  arrivalsC:[0,1,2,5,6,7], serviceC:[0,0,3,0,0,0], serviceD:[0,0,0,0,0,0],
  departuresC:[4,8,12,16,20,24], departuresD:[14,18,22,26,30,34],
  seatsC:2,seatsD:2,travelCD:8,travelDB:10,
  seed:24,arrivalJitter:2,serviceJitterC:3,transitJitter:2,serviceJitterD:2,cancelChance:0.12,
});

function finiteList(value,name,nonempty=true){
  if(!Array.isArray(value)||value.length>(name.includes('departures')?48:24)||nonempty&&!value.length||
     value.some(x=>typeof x!=='number'||!Number.isFinite(x)||x<0))throw new Error(`${name} 须为非负有限数值列表`);
}
export function validate(input){
  const p={...EXAMPLE,...input};
  for(const key of ['arrivalsC','serviceC','serviceD','departuresC','departuresD'])finiteList(p[key],key);
  if(p.arrivalsC.length!==p.serviceC.length||p.arrivalsC.length!==p.serviceD.length)throw new Error('两站作业时间必须与飞机数量一致');
  for(const key of ['departuresC','departuresD'])if(p[key].some((x,i)=>i&&x<=p[key][i-1]))throw new Error(`${key} 必须严格递增`);
  for(const key of ['seatsC','seatsD'])if(!Number.isInteger(p[key])||p[key]<1||p[key]>20)throw new Error(`${key} 须为 1–20 的整数`);
  for(const key of ['travelCD','travelDB','arrivalJitter','serviceJitterC','transitJitter','serviceJitterD'])
    if(typeof p[key]!=='number'||!Number.isFinite(p[key])||p[key]<0||p[key]>1000)throw new Error(`${key} 须为 0–1000 的有限数值`);
  if(!Number.isInteger(p.seed)||p.seed<0||p.seed>2147483647)throw new Error('随机种子须为非负整数');
  if(typeof p.cancelChance!=='number'||p.cancelChance<0||p.cancelChance>1)throw new Error('取消班次概率须在 0–1');
  return p;
}
function generator(seed){let state=(seed||1)>>>0;return ()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296}}

// Strict FIFO: a not-yet-ready head flight holds the line; later flights
// cannot overtake it. This deliberately exposes handling-induced blocking.
export function boardFifo(flights,departures,seats,station){
  const ordered=[...flights].filter(f=>f.arrival!==null).sort((a,b)=>a.arrival-b.arrival||a.id-b.id);
  let head=0;const events=[],batches=[];
  departures.forEach((trip,batch)=>{
    const capacity=trip.seats??seats;
    if(!Number.isInteger(capacity)||capacity<0||capacity>20)throw new Error(`${station} 第 ${batch+1} 班空位须为 0–20 的整数`);
    const report={...trip,station,batch,capacity,boarded:0,unused:trip.cancelled?0:capacity,waiting:0,actualSize:null,flights:[]};batches.push(report);
    if(trip.cancelled){report.waiting=ordered.slice(head).filter(f=>f.arrival<=trip.time).length;events.push({time:trip.time,station,type:'cancel',text:`${station} ${trip.time} 分编队取消`});return}
    if(capacity===0)events.push({time:trip.time,station,type:'noSeats',text:`${station} ${trip.time} 分编队正常出发，中转空位为 0`});
    let boarded=0;
    while(boarded<capacity && head<ordered.length){
      const f=ordered[head];
      if(f.arrival>trip.time+1e-9||f.ready>trip.time+1e-9)break;
      f.departure=trip.time;f.batch=batch;f.seat=boarded+1;
      f.queueWait=trip.time-f.ready;f.dwell=trip.time-f.arrival;
      events.push({time:trip.time,station,type:'board',flight:f.id,text:`F${f.id+1} 从 ${station} 搭第 ${batch+1} 班（位次 ${f.seat}）`});
      report.flights.push(f.id);boarded++;head++;
    }
    report.boarded=boarded;report.unused=capacity-boarded;report.waiting=ordered.slice(head).filter(f=>f.arrival<=trip.time).length;
    report.actualSize=Number.isInteger(trip.local)?trip.local+boarded:null;
    if(boarded<capacity && head<ordered.length && ordered[head].arrival<=trip.time)
      events.push({time:trip.time,station,type:'blocked',text:`${station} 队首 F${ordered[head].id+1} 作业未完成，空位 ${capacity-boarded} 个未使用`});
  });
  return {flights:ordered,events,batches};
}

function oneRun(p,perturbed){
  const rand=generator(p.seed), n=p.arrivalsC.length;
  const flights=Array.from({length:n},(_,id)=>{
    const arrivalDelay=perturbed?rand()*p.arrivalJitter:0;
    const extraC=perturbed?rand()*p.serviceJitterC:0;
    const transitDelay=perturbed?rand()*p.transitJitter:0;
    const extraD=perturbed?rand()*p.serviceJitterD:0;
    return {id,plannedArrivalC:p.arrivalsC[id],arrivalC:p.arrivalsC[id]+arrivalDelay,
      serviceC:p.serviceC[id]+extraC,transitDelay,serviceD:p.serviceD[id]+extraD,
      departureC:null,arrivalD:null,departureD:null,arrivalB:null,waitC:null,waitD:null,
      queueC:null,queueD:null,batchC:null,batchD:null};
  });
  const tripsC=p.departuresC.map(time=>({time,cancelled:perturbed&&rand()<p.cancelChance}));
  const tripsD=p.departuresD.map(time=>({time,cancelled:perturbed&&rand()<p.cancelChance}));
  const c=flights.map(f=>({id:f.id,arrival:f.arrivalC,ready:f.arrivalC+f.serviceC,departure:null}));
  const cResult=boardFifo(c,tripsC,p.seatsC,'C');
  for(const item of cResult.flights){const f=flights[item.id];f.departureC=item.departure;f.waitC=item.dwell;f.queueC=item.queueWait;f.batchC=item.batch??null;
    if(item.departure!==null)f.arrivalD=item.departure+p.travelCD+f.transitDelay;}
  const d=flights.map(f=>({id:f.id,arrival:f.arrivalD,ready:f.arrivalD===null?null:f.arrivalD+f.serviceD,departure:null}));
  const dResult=boardFifo(d,tripsD,p.seatsD,'D');
  for(const item of dResult.flights){const f=flights[item.id];f.departureD=item.departure;f.waitD=item.dwell;f.queueD=item.queueWait;f.batchD=item.batch??null;
    if(item.departure!==null)f.arrivalB=item.departure+p.travelDB;}
  const events=[...flights.map(f=>({time:f.arrivalC,station:'C',type:'arrival',flight:f.id,text:`F${f.id+1} 到达 C，作业 ${f.serviceC.toFixed(1)} 分`})),
    ...cResult.events,...flights.filter(f=>f.arrivalD!==null).map(f=>({time:f.arrivalD,station:'D',type:'arrival',flight:f.id,text:`F${f.id+1} 到达 D，作业 ${f.serviceD.toFixed(1)} 分`})),...dResult.events]
    .concat(flights.filter(f=>f.arrivalB!==null).map(f=>({time:f.arrivalB,station:'B',type:'arrival',flight:f.id,text:`F${f.id+1} 抵达 B`})))
    .sort((a,b)=>a.time-b.time||a.station.localeCompare(b.station));
  return {flights,tripsC,tripsD,events};
}
export function simulateNetwork(input){
  const parameters=validate(input),baseline=oneRun(parameters,false),scenario=oneRun(parameters,true);
  const comparisons=scenario.flights.map((f,i)=>{
    const b=baseline.flights[i];
    return {...f,baselineDepartureC:b.departureC,baselineDepartureD:b.departureD,baselineArrivalB:b.arrivalB,
      delayC:f.departureC===null||b.departureC===null?null:f.departureC-b.departureC,
      delayD:f.departureD===null||b.departureD===null?null:f.departureD-b.departureD,
      delayB:f.arrivalB===null||b.arrivalB===null?null:f.arrivalB-b.arrivalB};
  });
  const finished=comparisons.filter(f=>f.arrivalB!==null),mean=key=>{const values=comparisons.map(f=>f[key]).filter(x=>x!==null);return values.length?values.reduce((a,x)=>a+x,0)/values.length:null};
  const horizon=Math.max(...parameters.departuresD, ...scenario.flights.map(f=>f.arrivalB??0))+parameters.travelDB;
  return {parameters,baseline,scenario,comparisons,horizon,
    summary:{completed:finished.length,total:comparisons.length,meanWaitC:mean('waitC'),meanWaitD:mean('waitD'),meanDelayB:mean('delayB'),
      late:finished.filter(f=>f.delayB>1e-9).length,amplified:finished.filter(f=>f.delayC!==null&&f.delayD!==null&&f.delayD>f.delayC+1e-9).length,
      cancellations:scenario.tripsC.filter(x=>x.cancelled).length+scenario.tripsD.filter(x=>x.cancelled).length}};
}
