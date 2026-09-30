// Local roster includes the leader. Reserved slots are held empty and provide no wake benefit.
export function activeStations(p){return p.stationCount===5?['C','D','E']:['C','D']}
export function stationTrips(p,station){
  return p['departures'+station].map((time,index)=>{
    if(p.capacityMode!==1)return {time,cancelled:false,seats:p['seats'+station],plannedSize:p.formationSize,local:null,reserved:0};
    const plannedSize=p['batchSize'+station][index],local=p['batchLocal'+station][index],reserved=p['batchReserved'+station][index];
    return {time,cancelled:false,plannedSize,local,reserved,seats:plannedSize-local-reserved};
  });
}
export function validateBatchCapacity(p){
  if(![0,1].includes(p.capacityMode))throw new Error('位次模式须为 0（固定）或 1（逐班）');
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
