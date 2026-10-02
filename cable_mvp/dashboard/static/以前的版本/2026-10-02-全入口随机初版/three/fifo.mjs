export function assignFifo(arrivals, departures, seats) {
  if (!Array.isArray(arrivals) || !Array.isArray(departures) || !arrivals.length || !departures.length ||
      [...arrivals, ...departures].some(x => !Number.isFinite(x) || x < 0) ||
      !Number.isInteger(seats) || seats < 1 || seats > 20) throw new Error('到达、发车须为非负时间；每班空位须为 1–20 的整数');
  if (departures.some((x, i) => i && x <= departures[i - 1])) throw new Error('发车时刻须严格递增');
  const slots = departures.flatMap((departure, batch) => Array.from({length: seats}, (_, seat) => ({departure, batch, seat: seat + 1})));
  let next = 0;
  return arrivals.map((arrival, index) => ({arrival, index})).sort((a, b) => a.arrival - b.arrival || a.index - b.index).map(flight => {
    while (next < slots.length && slots[next].departure < flight.arrival) next++;
    const assigned = slots[next++];
    return {...flight, departure: assigned?.departure ?? null, batch: assigned?.batch ?? null,
      seat: assigned?.seat ?? null, wait: assigned ? assigned.departure - flight.arrival : null};
  }).sort((a, b) => a.index - b.index);
}

export function averageWaitApprox(arrivalRate, interval, seats) {
  const u = arrivalRate * interval / seats;
  return {utilization: u, wait: u >= 1 ? null : interval / 2 * (1 + u / (seats * (1 - u)))};
}

// Voluntary deferral: when the target declines a seat, it moves behind aircraft
// already waiting. A skipped seat can still be taken by the next eligible one.
export function assignWithDeferral(arrivals, departures, seats, targetIndex, earliestBoard) {
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= arrivals.length ||
      !Number.isFinite(earliestBoard)) throw new Error('目标飞机或最早登编时刻不合法');
  assignFifo(arrivals, departures, seats); // shared input validation
  const ordered=arrivals.map((arrival,index)=>({arrival,index})).sort((a,b)=>a.arrival-b.arrival||a.index-b.index);
  const result=arrivals.map((arrival,index)=>({arrival,index,departure:null,batch:null,seat:null,wait:null}));
  let next=0, queue=[];
  departures.forEach((departure,batch)=>{
    while(next<ordered.length && ordered[next].arrival<=departure)queue.push(ordered[next++].index);
    for(let seat=1;seat<=seats;seat++){
      if(!queue.length)break;
      if(queue[0]===targetIndex && departure<earliestBoard)queue.push(queue.shift());
      const eligible=queue.findIndex(index=>index!==targetIndex||departure>=earliestBoard);
      if(eligible<0)break;
      const index=queue.splice(eligible,1)[0];
      Object.assign(result[index],{departure,batch,seat,wait:departure-arrivals[index]});
    }
  });
  return result;
}
