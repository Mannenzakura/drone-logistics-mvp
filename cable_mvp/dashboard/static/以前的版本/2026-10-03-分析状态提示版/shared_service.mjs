export function assignService(jobs,servers=1){
 if(!Number.isInteger(servers)||servers<1||servers>20)throw new Error('共享设备数量须为1–20整数');
 const available=Array(servers).fill(0),result=new Map();
 for(const j of [...jobs].sort((a,b)=>a.arrival-b.arrival||a.id-b.id)){
  if(!Number.isFinite(j.arrival)||j.arrival<0||!Number.isFinite(j.work)||j.work<0)throw new Error('设备作业到达与时长须为非负有限数');
  if(j.work===0){result.set(j.id,{start:j.arrival,end:j.arrival,queue:0,server:null});continue}
  let k=0;for(let i=1;i<servers;i++)if(available[i]<available[k])k=i;
  const start=Math.max(j.arrival,available[k]),end=start+j.work;available[k]=end;
  result.set(j.id,{start,end,queue:start-j.arrival,server:k});
 }
 return result;
}
export function sharedCService(p,rows){
 const own=new Map(rows.map(r=>[p.globalIdsC?.[r.id]??r.id,r]));
 const jobs=p.sharedJobsC??rows.map(r=>({id:r.id,arrival:r.arrivalC,work:r.workC}));
 return assignService(jobs.map(j=>{const r=own.get(j.id);return r?{id:j.id,arrival:r.arrivalC,work:r.workC}:j}),p.serviceServersC);
}
