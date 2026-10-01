// Local-priority queue; one leader is separate from cargo-carrying demand.
export function generateLocalArrivals(seed,rate,start,end){
 let state=seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return (state+.5)/4294967296};
 const arrivals=[];if(rate===0)return arrivals;let time=start;
 while(true){time+=-Math.log(1-random())/rate;if(time>end)break;arrivals.push(time);if(arrivals.length>30000)throw new Error('本地到达样本过大，请缩短时段或降低到达率')}
 return arrivals;
}
export function serveLocalQueue(arrivals,trips,size,reserved){
 let arrived=0,head=0,waitSum=0;return trips.map(trip=>{
 while(arrived<arrivals.length&&arrivals[arrived]<=trip.time+1e-9)arrived++;
 const backlogBefore=arrived-head,localServed=trip.cancelled?0:Math.min(backlogBefore,size-reserved-1),localWaits=[];
 for(let i=0;i<localServed;i++){const wait=trip.time-arrivals[head++];waitSum+=wait;localWaits.push(wait)}
 return {...trip,plannedSize:size,reserved,local:trip.cancelled?0:1+localServed,seats:trip.cancelled?0:size-reserved-1-localServed,localArrived:arrived,localServed,localServedTotal:head,localBacklogBefore:backlogBefore,localBacklog:arrived-head,localMeanWait:head?waitSum/head:null,localWaits,localArrivalTimes:arrivals};
 });
}
export function localAtTime(batches,time){const arrivals=batches[0]?.localArrivalTimes??[];const arrived=arrivals.filter(t=>t<=time).length;const last=batches.filter(b=>b.time<=time).at(-1);return {arrived,served:last?.localServedTotal??0,backlog:arrived-(last?.localServedTotal??0),meanWait:last?.localMeanWait??null}}
