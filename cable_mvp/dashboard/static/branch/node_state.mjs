export function nodeState(plan,node,time){
 if(!['A','C','D','E','B'].includes(node))throw new Error('未知节点');
 const present=[],completed=[],inbound=[];
 const label=r=>'F'+(r.id+1),outgoing=node==='C'?['C→D','C→E']:['D','E'].includes(node)?[node+'→B']:[];
 for(const r of plan.rows){
  if(node==='A'&&r.origin&&r.origin!=='A')continue;
  const start=r.origin?r.created:r.arrivalC-plan.p.ac/plan.p.speed*60;
  const a=node==='A'?(r.origin?r.created:0):node==='C'?r.arrivalC:node==='B'?r.arrivalB:r.branch===node?r.arrivalHub:null;
  const departure=node==='A'?start:node==='C'?r.departC:r.destination===node?r.completionTime:r.departHub;
  if(node==='B'){if(a!==null&&a<=time)completed.push({...r,label:label(r),state:'已交付',arrival:a});else if(r.destination==='B'&&r.departHub!==null&&r.departHub<=time)inbound.push({...r,label:label(r),eta:a});continue}
  if(a===null)continue;
  if(a>time){const previous=node==='C'?(r.origin==='C'?null:start):r.origin===node?null:r.departC;if(previous!==null&&previous<=time)inbound.push({...r,label:label(r),eta:a});continue}
  if(departure!==null&&departure<=time){completed.push({...r,label:label(r),state:node==='A'?'已起飞':r.destination===node?'本站交付完成':'已离站',arrival:a});continue}
  const work=node==='C'?r.workC:node==='A'?0:r.workHub;
  const workStart=node==='C'?(r.serviceStartC??a):node==='A'?a:r.serviceStartHub??a,workEnd=node==='C'?(r.serviceEndC??a+work):node==='A'?a:r.serviceEndHub??a+work;
  const ready=workEnd+(r.id===plan.p.target&&r.destination!==node&&node!=='A'?plan.p.joinBuffer:0);
  const state=node==='A'?'等待起飞':time<workStart?'设备排队':time<workEnd?'装卸作业':r.destination===node?'本站交付':time<ready?'入编准备':'FIFO 等待';
  present.push({...r,label:label(r),arrival:a,departure,ready,state,next:node==='A'?'C':node==='C'?r.branch:r.destination===node?'本站结束':'B',dwell:Math.max(0,time-a)});
 }
 present.sort((a,b)=>a.arrival-b.arrival||a.id-b.id);
 const queues=outgoing.map(leg=>({leg,flights:present.filter(r=>r.destination!==node&&(node!=='C'||r.branch===leg.at(-1))),next:plan.batches.find(b=>b.station===leg&&b.time>time)??null,last:plan.batches.filter(b=>b.station===leg&&b.time<=time).at(-1)??null}));
 return {node,time,present,completed,inbound,queues};
}
