import {eventSchedule} from './event_network.mjs?v=20261003-network25';
import {networkLedger} from './network_economics.mjs?v=20261003-network25';
import {wilson} from './paired_routes.mjs?v=20261003-network25';
import {summarizeDiagnostics} from './joint_diagnostics.mjs?v=20261003-network25';
export function assessEvent(p,mission,backgrounds,seeds,c,o,buildInput,detail=false){
 const strategy=c.chargeStrategy??'none',slots=strategy==='none'?0:o.jointChargeSlots;
 const cp={...p,groundStandby:1,energyPolicy:slots?'charge':'terminate',chargeSlots:slots,chargeStrategy:strategy==='none'?'full':strategy};
 let successes=0,payoff=0,netSum=0,energySum=0,networkSum=0,ordinarySum=0;const trials=[],ledgerTotals={};
 for(let i=0;i<seeds.length;i++){
  const input=buildInput(cp,mission,backgrounds[i],c),r=eventSchedule(input,input.fullJobs[input.target].workC,input.fullJobs[input.target].workHub,o);
  // buildInput applies the target fee factor for the legacy engine; the network ledger applies each job's factor itself.
  const all=networkLedger({...input,feeQ:p.feeQ,feeDropC:p.feeDropC,feeLoadC:p.feeLoadC,feeLoadD:p.feeLoadD},r,o),tag=all.tasks.find(t=>t.isTarget),row=r.rows.find(t=>t.id===input.target),success=tag.success;
  const ledger={...tag.ledger,net:tag.net-(o.incrementalCost??0),improvement:o.incrementalCost??0,undeliveredKg:tag.undeliveredKg};
  for(const k of ['revenue','timeCost','handling','fixed','electricity','penalty','rescue','improvement','chargeCost','gridEnergy'])ledgerTotals[k]=(ledgerTotals[k]??0)+ledger[k];
  const ordinary=all.tasks.filter(t=>!t.isTarget&&t.cargoType==='普通'),share=ordinary.length?ordinary.filter(t=>!t.success).length/ordinary.length:0;
  successes+=Number(success);payoff+=ledger.net;networkSum+=all.net;ordinarySum+=share;if(success){netSum+=ledger.net;energySum+=ledger.energy;}
  if(detail){const cut=tag.stop,unC=row.departC===null?Math.max(0,cut-(row.arrivalC??cut)):null,unH=row.arrivalD!==null&&row.departD===null?Math.max(0,cut-row.arrivalD):null;
   const diagnostic={success,reason:success?'成功':row.terminationReason??'未完成',arrival:row.arrivalB,energy:ledger.energy,energyLimit:p.battery-p.energyReserve,serviceQueueC:row.arrivalC===null?null:row.serviceStartC===null?Math.max(0,cut-row.arrivalC):row.serviceQueueC,batchWaitC:row.departC===null?null:Math.max(0,row.departC-row.serviceEndC),batchWaitHub:row.departD===null?null:Math.max(0,row.departD-row.serviceEndHub),unservedLowerC:unC,unservedLowerHub:unH,deviceWaitPresent:row.serviceQueueC>0};
   trials.push({seed:seeds[i],success,arrival:row.arrivalB,energy:ledger.energy,net:success?ledger.net:null,objectiveValue:ledger.net,ledger,diagnostic,networkNet:all.net,surfaceInfrastructure:all.totals.surfaceInfrastructure,padWait:r.rows.reduce((a,r)=>a+r.surfaceHistory.reduce((b,c)=>b+Math.max(0,(c.reservedAt??c.releasedAt??o.deadline)-c.requested),0),0),movementWait:r.rows.reduce((a,r)=>a+r.surfaceHistory.reduce((b,c)=>b+Math.max(0,(c.landingStart??c.releasedAt??o.deadline)-(c.reservedAt??c.releasedAt??o.deadline))+Math.max(0,(c.takeoffStart??c.releasedAt??o.deadline)-(c.takeoffRequested??c.releasedAt??o.deadline)),0),0),ordinaryUnservedShare:share,network:{generated:all.generated-1,completed:all.completed-Number(success),ordinary:ordinary.length,ordinaryUnserved:ordinary.filter(t=>!t.success).length,ordinaryLong:ordinary.filter(t=>t.wait>15).length},sample:i===0?{schedule:r,seed:seeds[i],config:{...c,chargeSlots:slots},horizon:o.deadline}:null});
  }
 }
 const interval=wilson(successes,seeds.length);
 return {...c,chargeStrategy:strategy,chargeSlots:slots,successes,runs:seeds.length,rate:successes/seeds.length,interval,passed:interval.low>=o.reliability,meanObjective:payoff/seeds.length,meanNetworkNet:networkSum/seeds.length,ordinaryUnservedShare:ordinarySum/seeds.length,meanLedger:Object.fromEntries(Object.entries(ledgerTotals).map(([k,v])=>[k,v/seeds.length])),meanUndeliveredKg:detail?trials.reduce((a,t)=>a+t.ledger.undeliveredKg,0)/seeds.length:null,successMeanNet:successes?netSum/successes:null,successMeanEnergy:successes?energySum/successes:null,...(detail?{trials,diagnostics:summarizeDiagnostics(trials.map(t=>t.diagnostic))}:{})};
}
export function pairedInterval(values){const mean=values.reduce((a,b)=>a+b,0)/values.length;if(values.length<2)return {mean,low:null,high:null};const se=Math.sqrt(values.reduce((a,b)=>a+(b-mean)**2,0)/(values.length-1)/values.length);return {mean,low:mean-1.96*se,high:mean+1.96*se};}
