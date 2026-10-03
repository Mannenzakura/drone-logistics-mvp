import {effectivePayload,winchTimes} from '../four_model.mjs?v=20261003-network22';
const fraction=(t,a,b)=>a===null||!Number.isFinite(a)?0:b>a?Math.max(0,Math.min(1,(t-a)/(b-a))):Number(t>=a);
const gamma=(p,n)=>{const x=(Math.max(1,n??1)-1)/Math.max(1,n??1);return 1-p.chi*p.eta*(p.role===1?x:p.role===2?x*x:0)};
export function networkLedger(p,s,o){
 const totals={revenue:0,timeCost:0,handling:0,fixed:0,electricity:0,penalty:0,rescue:0,energy:0,gridEnergy:0,chargeCost:0,chargingInfrastructure:0,equipment:0,airport:0,leader:0},tasks=[];
 for(const r of s.rows){
  const a=r.origin==='A',atC=r.arrivalC!==null,hub=r.arrivalD!==null,branch=r.branch,cd=branch==='D'?p.fullCD??p.cd:p.fullCE??p.ce,db=branch==='D'?p.fullDB??p.db:p.fullEB??p.eb;
  const q=r.weight,d=r.dropC??0,l=r.loadC??0,h=r.loadHub??0,c={dC:d,lC:l,lHub:h},timing=winchTimes(p,d,l,h),end=r.completionTime;
  const mass=a?q+Math.max(d,l,h):r.origin==='C'?q+h:q;
  const invalid=mass>effectivePayload({...p,ac:a?p.ac:0,cd:atC?cd:0,db:r.destination==='B'?db:0})+1e-9||(!p.allowExtrapolation&&((a?p.ac:0)+(atC?cd:0)+(r.destination==='B'?db:0))>p.referenceRange)||Math.max(d,l,h)>p.bay+1e-9||(p.winchEnabled&&Math.max(d,l,h)>p.winchCapacity+1e-9)||(p.sharedC&&atC&&r.workC>0&&(r.workC>p.airspaceC||p.permitC<1))||(p.sharedD&&hub&&r.workD>0&&(r.workD>p.airspaceD||p.permitD<1));
  const energyAt=t=>{
   if(s.eventDriven)return r.energySegments.reduce((a,x)=>a+x.energy*fraction(t,x.start,x.end),0);
   const cruise=(a?p.ac*(p.k0+p.kLoad*(q+d))*fraction(t,r.created,r.arrivalC):0)+(atC?cd*(p.k0+p.kLoad*(q+l))*gamma(p,r.formationC)*fraction(t,r.departC,r.arrivalD):0)+(r.destination==='B'?db*(p.k0+p.kLoad*(q+h))*gamma(p,r.formationD)*fraction(t,r.departD,r.arrivalB):0);
   const waitC=atC?Math.max(0,Math.min(t,r.departC??t)-r.arrivalC):0,waitH=hub?Math.max(0,Math.min(t,r.departD??(r.destination===branch?end:t))-r.arrivalD):0;
   return cruise+(a?p.loiterRate:o.groundEnergyRate)*waitC+(['D','E'].includes(r.origin)?o.groundEnergyRate:p.loiterRate)*waitH+(atC&&t>=r.serviceStartC?p.handlingEnergyC*Number(r.workC>0):0)+(hub&&t>=r.arrivalD?p.handlingEnergyD*Number(r.workD>0):0);
  };
  const due=r.dispatchDeadline??o.deadline,budget=p.battery-p.energyReserve;let stop=Math.min(o.deadline,due,end??o.deadline,r.terminatedAt??o.deadline),depleted=false;
  if(!s.eventDriven&&!invalid&&energyAt(stop)>budget){let lo=Math.min(stop,r.created),hi=stop;for(let k=0;k<45;k++){const mid=(lo+hi)/2;if(energyAt(mid)>budget)hi=mid;else lo=mid}stop=lo;depleted=true}
  const stage=(arrival,x,y,suffix)=>{if(arrival===null)return {drop:Infinity,load:Infinity};const drop=arrival+(p.winchTiming?p['approach'+suffix]:p['t0'+suffix])+(p.winchTiming?timing.drop:p['tDrop'+suffix])*x;return {drop,load:drop+(p.winchTiming?p['exchangeFixed'+suffix]+p['exchangePerKg'+suffix]*(x+y):0)+(p.winchTiming?timing.pickup:p['tLoad'+suffix])*y}};
  const cs=stage(r.serviceStartC,d,l,'C'),hs=stage(s.eventDriven?r.serviceStartHub:r.arrivalD,l,h,'D'),factor=r.feeFactor??1;
  const groups=[{kg:q,from:r.created,delivery:end,fee:p.feeQ,rate:p.timeQ,handling:p.handlingQ},{kg:d,from:r.created,delivery:cs.drop,fee:p.feeDropC,rate:p.timeDropC,handling:p.handlingDropC},{kg:l,from:cs.load,delivery:hs.drop,fee:p.feeLoadC,rate:p.timeLoadC,handling:p.handlingLoadC},{kg:h,from:hs.load,delivery:r.arrivalB,fee:p.feeLoadD,rate:p.timeLoadD,handling:p.handlingLoadD}];
  const ledger={revenue:0,timeCost:0,handling:0,fixed:0,electricity:0,penalty:0,rescue:0,energy:0,gridEnergy:0,chargeCost:0};let undeliveredKg=0;
  for(const g of groups){const received=!invalid&&stop>=g.from,delivered=received&&g.delivery!==null&&stop>=g.delivery;if(received){ledger.handling+=g.kg*g.handling;ledger.timeCost+=g.kg*g.rate*Math.max(0,Math.min(stop,g.delivery??stop)-g.from);if(delivered)ledger.revenue+=g.kg*g.fee*factor;else undeliveredKg+=g.kg}}
  const success=!invalid&&!depleted&&r.terminatedAt==null&&end!==null&&end<=stop+1e-8;
  const charged=(r.chargeHistory??[]).reduce((a,c)=>{const f=c.start===null?0:fraction(Math.min(stop,c.ended??stop),c.start,c.finish);a.store+=(c.storeEnergy??0)*f;a.grid+=(c.gridEnergy??0)*f;a.visits+=Number(c.setupStart!==undefined&&c.setupStart<=stop);return a},{store:0,grid:0,visits:0});
  ledger.energy=invalid?0:(s.eventDriven?energyAt(stop):Math.min(budget,energyAt(stop)));ledger.gridEnergy=charged.grid;ledger.electricity=(Math.max(0,ledger.energy-charged.store)+charged.grid)*p.energyPrice;ledger.chargeCost=charged.visits*(o.chargeVisitCost??.5);
  ledger.fixed=invalid?0:(atC&&stop>=r.serviceStartC&&r.workC>0?p.fixedCostC:0)+(hub&&stop>=r.arrivalD&&r.workD>0?p.fixedCostD:0)+(s.eventDriven?(r.landings??0)*(o.landingCost??.2):0);
  ledger.penalty=success?0:o.failurePenalty;ledger.rescue=depleted?o.rescueCost:0;
  const net=ledger.revenue-ledger.timeCost-ledger.handling-ledger.fixed-ledger.electricity-ledger.penalty-ledger.rescue-ledger.chargeCost;
  tasks.push({id:r.id,isTarget:r.id===p.target,cargoType:r.cargoType,origin:r.origin,success,invalid,depleted,stop,due,net,undeliveredKg,chargeVisits:charged.visits,terminationReason:r.terminationReason??null,ledger,wait:(atC?Math.max(0,Math.min(stop,r.departC??stop)-r.arrivalC):0)+(hub&&r.destination==='B'?Math.max(0,Math.min(stop,r.departD??stop)-r.arrivalD):0)});
  for(const k of Object.keys(ledger))totals[k]+=ledger[k];
 }
 totals.chargingInfrastructure=o.deadline*3*(s.chargeSlots??0)*(o.chargeDeviceCostPerMinute??.01);
 totals.equipment=o.deadline*(p.serviceEnabledC?p.serviceServersC:0)*o.deviceCostPerMinute;totals.airport=o.deadline*o.airportCostPerMinute;
 for(const b of s.batches.filter(b=>!b.cancelled&&b.time<=o.deadline)){const dist=b.station==='C→D'?p.fullCD??p.cd:b.station==='C→E'?p.fullCE??p.ce:b.station==='D→B'?p.fullDB??p.db:p.fullEB??p.eb;const energy=dist*p.k0*gamma(p,b.actualSize)*fraction(o.deadline,b.time,b.time+dist/p.speed*60)+o.groundEnergyRate*b.connectionDelay;totals.leader+=o.leaderDepartureCost+energy*p.energyPrice;}
 const net=totals.revenue-totals.timeCost-totals.handling-totals.fixed-totals.electricity-totals.penalty-totals.rescue-totals.equipment-totals.airport-totals.leader-totals.chargeCost-totals.chargingInfrastructure;
 return {net,totals,tasks,completed:tasks.filter(t=>t.success).length,generated:tasks.length,undeliveredKg:tasks.reduce((a,t)=>a+t.undeliveredKg,0),connectionDelay:s.batches.reduce((a,b)=>a+b.connectionDelay,0)};
}
