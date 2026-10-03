import {generateLocalArrivals,serveLocalQueue} from './local_queue.mjs?v=20261003-network23';
// Local roster includes the leader. Reserved slots are held empty and provide no wake benefit.
export function activeStations(p){return p.stationCount===5?['C','D','E']:['C','D']}
export function randomTrips(p,station){
  let seed=(p.batchSeed ^ ({C:1103,D:2207,E:3301}[station]))>>>0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
  return p['departures'+station].map(time=>{
    const plannedSize=p.batchMax,reserved=p.batchReserve;
    let local=1;
    for(let i=1;i<plannedSize-reserved;i++)if(random()<p['localProbability'+station])local++;
    return {time,cancelled:false,plannedSize,local,reserved,seats:plannedSize-local-reserved};
  });
}
export function stationTrips(p,station,overrides=[]){
  if(p.capacityMode===3){
    const times=p['departures'+station],start=Math.max(0,times[0]-p.localWarmup),seed=(p.batchSeed^({C:1103,D:2207,E:3301}[station]))>>>0;
    const arrivals=generateLocalArrivals(seed,p['localRate'+station],start,times.at(-1));
    return serveLocalQueue(arrivals,times.map((time,i)=>({time,cancelled:overrides[i]?.cancelled??false})),p.batchMax,p.batchReserve);
  }
  if(p.capacityMode===2)return randomTrips(p,station);
  return p['departures'+station].map((time,index)=>{
    if(p.capacityMode!==1)return {time,cancelled:false,seats:p['seats'+station],plannedSize:p.formationSize,local:null,reserved:0};
    const plannedSize=p['batchSize'+station][index],local=p['batchLocal'+station][index],reserved=p['batchReserved'+station][index];
    return {time,cancelled:false,plannedSize,local,reserved,seats:plannedSize-local-reserved};
  });
}
export function validateBatchCapacity(p){
  if(![0,1,2,3].includes(p.capacityMode))throw new Error('位次模式须为 0 固定、1 手工、2 独立抽样、3 连续到达');
  if(p.capacityMode===2||p.capacityMode===3){
    if(!Number.isInteger(p.batchSeed)||p.batchSeed<0||p.batchSeed>4294967295)throw new Error('随机种子须为 0–4294967295 整数');
    if(!Number.isInteger(p.batchMax)||p.batchMax<1||p.batchMax>20||!Number.isInteger(p.batchReserve)||p.batchReserve<0||p.batchReserve>=p.batchMax)throw new Error('随机总规模须为 1–20，预留空位须小于总规模');
    if(p.capacityMode===3){if(!Number.isFinite(p.localWarmup)||p.localWarmup<0||p.localWarmup>1440)throw new Error('预热时长须在 0–1440 min');for(const s of activeStations(p)){if(!Number.isFinite(p['localRate'+s])||p['localRate'+s]<0||p['localRate'+s]>20||p['departures'+s].at(-1)>1440)throw new Error('本地到达率须在 0–20 架/min，班次时刻不超过1440 min')}}
    for(const s of activeStations(p))if(p.capacityMode===2&&(!Number.isFinite(p['localProbability'+s])||p['localProbability'+s]<0||p['localProbability'+s]>1))throw new Error(`${s} 本地需求概率须在 0–1 之间`);
  }
  for(const station of activeStations(p)){
    if(!Number.isInteger(p['seats'+station])||p['seats'+station]<0||p['seats'+station]>20)throw new Error(`${station} 固定空位须为 0–20 的整数`);
    if(p.capacityMode!==1)continue;
    const times=p['departures'+station];
    for(const prefix of ['batchSize','batchLocal','batchReserved']){
      const values=p[prefix+station];
      if(!Array.isArray(values)||values.length!==times.length||values.some(v=>!Number.isInteger(v)||v<0||v>20))throw new Error(`${station} 逐班规模、本地机和预留位次须与班次数一致，且为 0–20 的整数`);
    }
    times.forEach((_,i)=>{
      const size=p['batchSize'+station][i],local=p['batchLocal'+station][i],reserved=p['batchReserved'+station][i];
      if(size<1||local<1)throw new Error(`${station} 第 ${i+1} 班至少要有一架本地领航机，且总规模至少为 1`);
      if(local+reserved>size)throw new Error(`${station} 第 ${i+1} 班本地机＋预留位次超过总规模`);
    });
  }
}
export function batchPressure(p,schedule){
  return activeStations(p).map(station=>{
    const rows=schedule.rows.filter(r=>r.destination!==station&&r['arrival'+station]!==null);
    const waits=rows.map(r=>r['wait'+station]).filter(v=>v!==null);
    const batches=schedule.batches.filter(b=>b.station===station);
    const offered=batches.reduce((sum,b)=>sum+(b.cancelled?0:b.capacity),0);
    const exceeded=waits.filter(w=>w>p.waitWarning).length;
    return {station,arrived:rows.length,boarded:waits.length,unserved:rows.length-waits.length,offered,
      demandSupply:offered?rows.length/offered:null,meanWait:waits.length?waits.reduce((a,b)=>a+b,0)/waits.length:null,
      maxWait:waits.length?Math.max(...waits):null,exceeded,zeroTrips:batches.filter(b=>!b.cancelled&&b.capacity===0).length};
  });
}
