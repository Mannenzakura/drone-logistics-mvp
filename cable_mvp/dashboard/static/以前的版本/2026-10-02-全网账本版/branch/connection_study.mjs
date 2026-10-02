import {flowSchedule} from './network_flow.mjs?v=20261002-network17';
import {networkLedger} from './network_economics.mjs?v=20261002-network17';
import {generateDemand} from './random_demand.mjs?v=20261002-network17';
import {trialSeeds,quantile} from './repeated.mjs?v=20261002-network17';
import {wilson} from './paired_routes.mjs?v=20261002-network17';
const mean=x=>x.reduce((a,b)=>a+b,0)/x.length;
const interval=x=>{const m=mean(x);if(x.length<2)return {mean:m,low:null,high:null};const se=Math.sqrt(x.reduce((a,b)=>a+(b-m)**2,0)/(x.length-1)/x.length);return {mean:m,low:m-1.96*se,high:m+1.96*se}};
export function connectionStudy(p,mission,candidate,o,exploreSeeds,excluded,buildInput,progress=()=>{}){
 const configs=[];for(const policy of ['strict','ready','deadline'])for(const shift of [...new Set([-o.shiftMinutes,0,o.shiftMinutes])])for(const hold of [...new Set([0,o.maxHold])])for(const extraDevice of [0,1])configs.push({policy,shift,hold,extraDevice});
 const freshSeeds=trialSeeds(o.networkSeed,o.runs,excluded),background=exploreSeeds.map(batchSeed=>generateDemand({...p,batchSeed})),fresh=freshSeeds.map(batchSeed=>generateDemand({...p,batchSeed}));
 const assess=(config,seeds,jobs)=>{
  const cp={...p,dispatchPolicy:config.policy,connectionHold:config.hold,serviceEnabledC:config.extraDevice?1:p.serviceEnabledC,serviceServersC:config.extraDevice?(p.serviceEnabledC?p.serviceServersC+1:1):p.serviceServersC,departuresD:p.departuresD.map(t=>t+config.shift),departuresEB:p.departuresEB.map(t=>t+config.shift)};
  if(Math.min(...cp.departuresD,...cp.departuresEB)<0)throw new Error('班次前移后为负时间');
  const trials=seeds.map((seed,i)=>{const input=buildInput(cp,mission,jobs[i],candidate),target=input.fullJobs[input.target],s=flowSchedule(input,target.workC,target.workHub),ledger=networkLedger({...input,feeQ:cp.feeQ,feeDropC:cp.feeDropC,feeLoadC:cp.feeLoadC,feeLoadD:cp.feeLoadD},s,o),ordinary=ledger.tasks.filter(t=>t.cargoType==='普通'&&t.id!==input.target),tag=ledger.tasks.find(t=>t.id===input.target);return {seed,net:ledger.net,targetSuccess:tag.success,ordinary:ordinary.length,ordinaryUnserved:ordinary.filter(t=>!t.success).length,ordinaryLong:ordinary.filter(t=>t.wait>15).length,ordinaryUnservedShare:ordinary.length?ordinary.filter(t=>!t.success).length/ordinary.length:0,ledger}});
  const successes=trials.filter(t=>t.targetSuccess).length,ci=wilson(successes,seeds.length),sums=trials.reduce((a,t)=>{for(const k of Object.keys(t.ledger.totals))a[k]=(a[k]??0)+t.ledger.totals[k];return a},{}),allTasks=trials.flatMap(t=>t.ledger.tasks),served=allTasks.filter(t=>t.success);
  return {config,trials,rate:successes/seeds.length,interval:ci,passed:ci.low>=o.reliability,meanNet:mean(trials.map(t=>t.net)),meanLedger:Object.fromEntries(Object.entries(sums).map(([k,v])=>[k,v/seeds.length])),completed:served.length,generated:allTasks.length,servedWaitP95:quantile(served.map(t=>t.wait)),ordinary:trials.reduce((a,t)=>a+t.ordinary,0),ordinaryUnserved:trials.reduce((a,t)=>a+t.ordinaryUnserved,0),ordinaryLong:trials.reduce((a,t)=>a+t.ordinaryLong,0),meanUndeliveredKg:mean(trials.map(t=>t.ledger.undeliveredKg)),meanConnectionDelay:mean(trials.map(t=>t.ledger.connectionDelay))};
 };
 const results=configs.map((c,i)=>{progress('班次与全网账本',i+1,configs.length);try{return assess(c,exploreSeeds,background)}catch(error){return {config:c,error:String(error.message??error)}}}),baseline=results.find(r=>r.config.policy==='strict'&&r.config.shift===0&&r.config.hold===0&&r.config.extraDevice===0);
 const choice=results.filter(r=>!r.error&&r.passed).sort((a,b)=>b.meanNet-a.meanNet)[0]??null;
 let review=null;
 if(choice){progress('全网政策独立复核',0,o.runs);const result=assess(choice.config,freshSeeds,fresh),reference=assess(baseline.config,freshSeeds,fresh),gain=interval(result.trials.map((t,i)=>t.net-reference.trials[i].net)),ordinaryChange=interval(result.trials.map((t,i)=>t.ordinaryUnservedShare-reference.trials[i].ordinaryUnservedShare));const otherTimeCost=t=>t.ledger.tasks.filter(x=>!x.isTarget).reduce((a,x)=>a+x.ledger.timeCost,0);const otherCargoTimeCostChange=interval(result.trials.map((t,i)=>otherTimeCost(t)-otherTimeCost(reference.trials[i])));review={result,reference,gain,ordinaryChange,otherCargoTimeCostChange,recommended:result.passed&&gain.low!==null&&gain.low>0&&ordinaryChange.high!==null&&ordinaryChange.high<=o.ordinaryTolerance};}
 return {results,baseline,choice,review,exploreSeeds,freshSeeds,scope:'固定路线及装卸决策；全网账本为固定排程的截止/电量停止核算，不回滚其他飞机排程。未包含未知需求或天气故障。'};
}
