import {flowSchedule} from './branch/network_flow.mjs?v=20261003-network27';
import {sharedCService} from './shared_service.mjs?v=20261003-network27';
import {boardFifo} from './network/engine.mjs?v=20261003-network27';
import {stationTrips,validateBatchCapacity} from './batch_capacity.mjs?v=20261003-network27';

export const FOUR_DEFAULTS={
  serviceEnabledC:0,serviceServersC:1,capacityMode:0,waitWarning:15,localWarmup:4,localRateC:1.4,localRateD:1.4,localRateE:1.4,batchSeed:20260930,batchMax:10,batchReserve:0,localProbabilityC:0.8,localProbabilityD:0.8,localProbabilityE:0.8,
  batchSizeC:[],batchLocalC:[],batchReservedC:[],batchSizeD:[],batchLocalD:[],batchReservedD:[],batchSizeE:[],batchLocalE:[],batchReservedE:[],
  stationCount:4,destinations:[],de:12.5,eb:12.5,departuresE:[44,48,52,56,60,64,68,72,76],seatsE:2,serviceE:0,
  arrivalsC:[17,18,19,22,23,24],backgroundServiceC:[0,0,0,0,0,0],backgroundServiceD:[0,0,0,0,0,0],target:2,
  departuresC:[21,25,29,33,37,41,45],departuresD:[35,39,43,47,51,55,59,63],seatsC:2,seatsD:2,
  ac:30,cd:25,db:25,direct:55,speed:108,q:10,payloadLimit:18,bay:5,
  referenceRange:110,allowExtrapolation:0,enforceReferencePayload:1,hardwareMass:1.764,boxMass:0,mountMass:0,
  winchEnabled:1,winchCapacity:5,winchHeight:20,winchTiming:0,
  dropRefSecondsPerKg:20.5,dropHeightSlope:.0175,pickupRefSecondsPerKg:20.5,pickupHeightSlope:.0175,
  approachC:0,exitC:0,exchangeFixedC:0,exchangePerKgC:0,approachD:0,exitD:0,exchangeFixedD:0,exchangePerKgD:0,
  demandDropC:5,demandLoadC:5,demandLoadD:5,step:.5,
  t0C:2,tDropC:.4,tLoadC:.6,t0D:2,tDropD:.4,tLoadD:.6,joinBuffer:.5,
  sharedC:0,sharedD:0,airspaceC:6,airspaceD:6,permitC:1,permitD:1,
  eta:.1,chi:.6,formationSize:3,role:1,
  k0:.025,kLoad:.0015,loiterRate:.045,handlingEnergyC:.1,handlingEnergyD:.1,battery:4.2,energyReserve:0,
  feeQ:8,feeDropC:8,feeLoadC:8,feeLoadD:8,
  timeQ:.015,timeDropC:.015,timeLoadC:.015,timeLoadD:.015,
  handlingQ:.25,handlingDropC:.25,handlingLoadC:.25,handlingLoadD:.25,
  fixedCostC:5,fixedCostD:5,energyPrice:1,
};

const EPS=1e-9;
export const routeDistance=p=>p.ac+p.cd+(p.stationCount===5?p.de+p.eb:p.db);
export function flightDestinations(p){return p.destinations?.length?p.destinations:Array(p.arrivalsC.length).fill('B')}

function finiteNonnegative(x,key){if(typeof x!=='number'||!Number.isFinite(x)||x<0)throw new Error(`${key} 须为非负有限数值`)}
export function validateFour(input){
  const p={...FOUR_DEFAULTS,...input};
  if(![4,5].includes(p.stationCount))throw new Error('站点数量须为 4 或 5');
  if(!Array.isArray(p.destinations)||p.destinations.length&&p.destinations.length!==p.arrivalsC.length)throw new Error('目的地数量须与飞机数一致');
  if(flightDestinations(p).some(v=>!(p.stationCount===5?['D','E','B']:['D','B']).includes(v)))throw new Error('四站目的地可选 D/B，五站可选 D/E/B');
  if(flightDestinations(p)[p.target]!=='B')throw new Error('当前经济优化目标机须以 B 为终点，请选去 B 的目标机');
  if(p.stationCount===5){
    if(!Array.isArray(p.departuresE)||!p.departuresE.length||p.departuresE.length>48||p.departuresE.some((v,i)=>!Number.isFinite(v)||v<0||(i&&v<=p.departuresE[i-1])))throw new Error('E 发车时刻须为最多 48 项的严格递增非负列表');
    if(p.de<=0||p.eb<=0)throw new Error('五站航段距离须大于 0');
  }
  for(const key of ['arrivalsC','backgroundServiceC','backgroundServiceD','departuresC','departuresD']){
    if(!Array.isArray(p[key])||!p[key].length||p[key].length>(p.fullJobs&&['arrivalsC','backgroundServiceC','backgroundServiceD'].includes(key)?128:48))throw new Error(`${key} 须为非空列表，最多 48 项`);
    p[key].forEach(v=>finiteNonnegative(v,key));
  }
  if(p.backgroundServiceC.length!==p.arrivalsC.length||p.backgroundServiceD.length!==p.arrivalsC.length)throw new Error('背景作业时间的项数须与飞机数一致');
  if(p.departuresC.some((v,i)=>i&&v<=p.departuresC[i-1])||p.departuresD.some((v,i)=>i&&v<=p.departuresD[i-1]))throw new Error('编队发车时刻须严格递增');
  for(const [key,val] of Object.entries(p))if(typeof val==='number')finiteNonnegative(val,key);
  for(const key of ['seatsC','seatsD','formationSize','role','target','sharedC','sharedD','permitC','permitD','allowExtrapolation','enforceReferencePayload','winchEnabled','winchTiming'])if(!Number.isInteger(p[key]))throw new Error(`${key} 须为整数`);
  if(p.target>=p.arrivalsC.length)throw new Error('目标飞机编号超过飞机数量');
  if(![0,1].includes(p.serviceEnabledC)||!Number.isInteger(p.serviceServersC)||p.serviceServersC<1||p.serviceServersC>20)throw new Error('共享设备开关须为0或1，设备数须为1–20整数');
  validateBatchCapacity(p);
  if(p.formationSize<1||p.formationSize>20||p.role>3||p.eta>1||p.chi>1)throw new Error('编队参数超出允许范围');
  if(![0,1].includes(p.sharedC)||![0,1].includes(p.sharedD)||![0,1].includes(p.permitC)||![0,1].includes(p.permitD))throw new Error('空域开关须为 0 或 1');
  for(const key of ['allowExtrapolation','enforceReferencePayload','winchEnabled','winchTiming'])if(![0,1].includes(p[key]))throw new Error(`${key} 须为 0 或 1`);
  if(p.step<=0||p.step>2||p.speed<=0||p.ac<=0||p.cd<=0||p.db<=0||p.direct<=0)throw new Error('步长、速度、距离须大于 0');
  if(p.referenceRange<=0)throw new Error('参考最远航程须大于 0');
  if(p.energyReserve>=p.battery)throw new Error('备用电量须小于任务可用电量');
  if(routeDistance(p)>p.referenceRange+EPS&&!p.allowExtrapolation)throw new Error(`四站总航程超过原文 ${p.referenceRange} km 适用范围；如需探索，请开启航程外推`);
  if(p.q>effectivePayload(p))throw new Error('固定货量超过航程、设备质量与结构限制后的有效载荷上限');
  return p;
}
export function effectivePayload(p){
  const reference=p.enforceReferencePayload?Math.min(20,37.5-(routeDistance(p))/4):Infinity;
  return Math.max(0,Math.min(p.payloadLimit,reference-p.hardwareMass-p.boxMass-p.mountMass));
}
export function winchTimes(p,dC,lC,lD){
  if(!p.winchTiming)return {workC:(dC+lC>EPS?1:0)*p.t0C+p.tDropC*dC+p.tLoadC*lC,
    workD:(lC+lD>EPS?1:0)*p.t0D+p.tDropD*lC+p.tLoadD*lD};
  const tau=(seconds,slope)=>Math.max(0,seconds/60+slope*(p.winchHeight-20));
  const drop=tau(p.dropRefSecondsPerKg,p.dropHeightSlope),pickup=tau(p.pickupRefSecondsPerKg,p.pickupHeightSlope);
  const workC=(dC+lC>EPS?1:0)*(p.approachC+p.exitC+p.exchangeFixedC)+drop*dC+pickup*lC+p.exchangePerKgC*(dC+lC);
  const workD=(lC+lD>EPS?1:0)*(p.approachD+p.exitD+p.exchangeFixedD)+drop*lC+pickup*lD+p.exchangePerKgD*(lC+lD);
  return {workC,workD,drop,pickup};
}
function grid(max,step){const values=[];for(let x=0;x<max-EPS;x+=step)values.push(Number(x.toFixed(8)));values.push(Number(max.toFixed(8)));return [...new Set(values)]}
function gamma(p,size=p.formationSize){const a=(size-1)/size;return 1-p.chi*p.eta*(p.role===1?a:p.role===2?a*a:0)}

export function cruiseFour(p,target,dC,lC,lD){
  const size=station=>p.capacityMode!==0?target['formation'+station]:p.formationSize;
  const gC=gamma(p,size('C')),gD=gamma(p,size('D')),gE=p.stationCount===5?gamma(p,size('E')):gD;
  const eAC=p.ac*(p.k0+p.kLoad*(p.q+dC)),soloCD=p.cd*(p.k0+p.kLoad*(p.q+lC));
  const perKm=p.k0+p.kLoad*(p.q+lD),eCD=soloCD*gC;
  const eDE=p.stationCount===5?p.de*perKm*gD:0,eEB=p.stationCount===5?p.eb*perKm*gE:0;
  const eDB=p.stationCount===5?eDE+eEB:p.db*perKm*gD;
  const savingCD=soloCD-eCD,savingDE=p.stationCount===5?p.de*perKm-eDE:0,savingEB=p.stationCount===5?p.eb*perKm-eEB:0;
  const savingDB=(p.stationCount===5?p.de+p.eb:p.db)*perKm-eDB;
  return {eAC,eCD,eDB,eDE,eEB,savingCD,savingDB,savingDE,savingEB,legGammas:{C:gC,D:gD,E:gE},gamma:gC,formationSaving:savingCD+savingDB};
}

export function scheduleFour(p,workC,workD,options={}){
  if(p.fullJobs)return flowSchedule(p,workC,workD,options);
  const destinations=flightDestinations(p),five=p.stationCount===5;
  const stations=five?['C','D','E']:['C','D'];
  const rows=p.arrivalsC.map((arrivalC,id)=>({id,destination:destinations[id],arrivalC:arrivalC+(options.arrivalDelay?.[id]??0),
    departC:null,arrivalD:null,departD:null,arrivalE:null,departE:null,arrivalB:null,waitC:null,waitD:null,waitE:null,
    workC:(id===p.target?workC:p.backgroundServiceC[id])+(options.extraC?.[id]??0),
    workD:(id===p.target?workD:p.backgroundServiceD[id])+(options.extraD?.[id]??0),workE:p.serviceE??0,
    terminalArrival:null,completionTime:null}));
  const service=p.serviceEnabledC?sharedCService(p,rows):null;
  for(const r of rows){const slot=service?.get(p.globalIdsC?.[r.id]??r.id);r.serviceStartC=slot?.start??r.arrivalC;r.serviceEndC=slot?.end??r.arrivalC+r.workC;r.serviceQueueC=slot?.queue??0;r.serviceServerC=slot?.server??null;}
  const events=[],batches=[];
  for(const station of stations){
    const outgoing=rows.filter(r=>r.destination!==station);
    for(const r of rows.filter(r=>r.destination===station&&r['arrival'+station]!==null)){
      r.terminalArrival=r['arrival'+station];r.completionTime=r.terminalArrival+r['work'+station];
      events.push({time:r.completionTime,station,type:'complete',flight:r.id,text:`F${r.id+1} 在 ${station} 完成交付，退出后续编队队列`});
    }
    const flights=outgoing.map(r=>({id:r.id,arrival:r['arrival'+station],ready:r['arrival'+station]===null?null:(station==='C'?r.serviceEndC:r['arrival'+station]+r['work'+station])+(r.id===p.target?p.joinBuffer:0),departure:null}));
    const trips=stationTrips(p,station,options['trips'+station]).map((trip,index)=>({...trip,cancelled:options['trips'+station]?.[index]?.cancelled??false}));
    const result=options.solo?{events:[],batches:[],flights:flights.filter(r=>r.arrival!==null).map(r=>({...r,departure:r.ready-(r.id===p.target?p.joinBuffer:0)}))}:boardFifo(flights,trips,p['seats'+station],station);
    events.push(...result.events);
    batches.push(...result.batches);
    const next=station==='C'?'D':station==='D'&&five?'E':'B';
    const distance=station==='C'?p.cd:station==='D'&&five?p.de:station==='E'?p.eb:p.db;
    for(const f of result.flights){
      const r=rows[f.id];r['depart'+station]=f.departure;r['wait'+station]=f.departure===null?null:f.departure-f.arrival;
      r['batch'+station]=f.batch??null;r['formation'+station]=f.departure===null?null:(result.batches[f.batch]?.actualSize??p.formationSize);
      r['arrival'+next]=f.departure===null?null:f.departure+distance/p.speed*60+(options['transit'+station]?.[r.id]??0);
      if(next==='B'&&r.arrivalB!==null){r.terminalArrival=r.arrivalB;r.completionTime=r.arrivalB}
    }
  }
  return {rows,batches,events:events.sort((a,b)=>a.time-b.time)};
}

export function evaluateFour(input,dC,lC,lD){
  const p=validateFour(input);
  for(const [name,value] of [['dC',dC],['lC',lC],['lD',lD]])finiteNonnegative(value,name);
  if(dC>p.demandDropC+EPS||lC>p.demandLoadC+EPS||lD>p.demandLoadD+EPS||
     Math.max(dC,lC,lD)>p.bay+EPS||p.q+Math.max(dC,lC,lD)>effectivePayload(p)+EPS||
     p.winchEnabled&&Math.max(dC,lC,lD)>p.winchCapacity+EPS)return null;
  const zC=Number(dC+lC>EPS),zD=Number(lC+lD>EPS);
  const {workC,workD,drop,pickup}=winchTimes(p,dC,lC,lD);
  if(p.sharedC&&(workC>p.airspaceC+EPS||zC>p.permitC)||p.sharedD&&(workD>p.airspaceD+EPS||zD>p.permitD))return null;
  const schedule=scheduleFour(p,workC,workD,{solo:p.soloIndependent===1});
  const target=schedule.rows[p.target];
  if(target.arrivalB===null)return null;
  const cruise=cruiseFour(p,target,dC,lC,lD),{eAC,eCD,eDB}=cruise,acMinutes=p.ac/p.speed*60;
  const eWait=p.loiterRate*(target.waitC+target.waitD+(target.waitE??0)),eHandle=p.handlingEnergyC*zC+p.handlingEnergyD*zD;
  const energy=eAC+eCD+eDB+eWait+eHandle;
  if(energy>p.battery-p.energyReserve+EPS)return null;
  const revenue=p.feeQ*p.q+p.feeDropC*dC+p.feeLoadC*lC+p.feeLoadD*lD;
  const timeCost=p.timeQ*p.q*(acMinutes+target.arrivalB-target.arrivalC)+p.timeDropC*dC*acMinutes+
    p.timeLoadC*lC*(target.arrivalD-target.arrivalC)+p.timeLoadD*lD*(target.arrivalB-target.arrivalD);
  const handling=p.handlingQ*p.q+p.handlingDropC*dC+p.handlingLoadC*lC+p.handlingLoadD*lD,fixed=p.fixedCostC*zC+p.fixedCostD*zD;
  const net=revenue-timeCost-handling-fixed-p.energyPrice*energy;
  return {p,dC,lC,lD,zC,zD,workC,workD,schedule,target,energy,...cruise,eWait,eHandle,revenue,timeCost,handling,fixed,net,drop,pickup};
}
export function optimizeFour(input){
  const p=validateFour(input),limit=Math.min(p.bay,effectivePayload(p)-p.q,p.winchEnabled?p.winchCapacity:Infinity);
  const ds=grid(Math.min(limit,p.demandDropC),p.step),cs=grid(Math.min(limit,p.demandLoadC),p.step),ls=grid(Math.min(limit,p.demandLoadD),p.step);
  let best=null,checked=0,feasible=0;
  for(const dC of ds)for(const lC of cs)for(const lD of ls){
    checked++;const result=evaluateFour(p,dC,lC,lD);if(!result)continue;feasible++;
    if(!best||result.net>best.net+EPS||(Math.abs(result.net-best.net)<=EPS&&result.target.arrivalB<best.target.arrivalB))best=result;
  }
  if(!best)throw new Error('当前班次、载荷与电量下，没有目标飞机可抵达 B 的方案');
  const matched=evaluateFour(p,0,0,0);
  const directMinutes=p.direct/p.speed*60,directEnergy=p.direct*(p.k0+p.kLoad*p.q);
  const directFeasible=(p.allowExtrapolation||p.direct<=p.referenceRange+EPS)&&p.q<=p.payloadLimit+EPS&&directEnergy<=p.battery-p.energyReserve+EPS;
  const directNet=directFeasible?p.feeQ*p.q-p.timeQ*p.q*directMinutes-p.handlingQ*p.q-p.energyPrice*directEnergy:null;
  return {...best,checked,feasible,matched,direct:{time:directMinutes,energy:directEnergy,net:directNet,feasible:directFeasible},
    extraCargoNet:matched?best.net-matched.net:null,matchedDelta:matched&&directFeasible?matched.net-directNet:null};
}
