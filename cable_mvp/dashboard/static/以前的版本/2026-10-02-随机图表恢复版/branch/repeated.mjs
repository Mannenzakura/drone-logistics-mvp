import {simulateBranch} from './model.mjs?v=20261002-charts11';
export const quantile=(values,p=.95)=>values.length?[...values].sort((a,b)=>a-b)[Math.max(0,Math.ceil(p*values.length)-1)]:null;
const mean=v=>v.length?v.reduce((a,b)=>a+b,0)/v.length:null;
export function proportionCI(v){const avg=mean(v);if(v.length<2)return {mean:avg,low:null,high:null,runs:v.length};const variance=v.reduce((s,x)=>s+(x-avg)**2,0)/(v.length-1);if(variance===0)return {mean:avg,low:null,high:null,runs:v.length,noVariation:true};const delta=1.96*Math.sqrt(variance/v.length);return {mean:avg,low:Math.max(0,avg-delta),high:Math.min(1,avg+delta),runs:v.length};}
function mix(x){x=Math.imul(x^(x>>>16),0x7feb352d);x=Math.imul(x^(x>>>15),0x846ca68b);return (x^(x>>>16))>>>0;}
export function trialSeeds(seed,runs,excludeSeeds=[]){
 if(!Number.isInteger(seed)||seed<0||seed>4294967295||!Number.isInteger(runs)||runs<1||runs>1000||!Array.isArray(excludeSeeds)||excludeSeeds.some(s=>!Number.isInteger(s)||s<0||s>4294967295))throw new Error('实验种子或次数无效');
 const excluded=new Set(excludeSeeds),result=[];let offset=0;while(result.length<runs){const x=mix((seed+offset++)>>>0);if(!excluded.has(x))result.push(x)}return result;
}
const empty=()=>({arrived:0,served:0,unserved:0,afterCutoff:0,waits:[],lowerWaitSum:0});
export function observePlan(plan){
 const observations={};for(const leg of ['C→D','C→E','D→B','E→B']){
  const batches=plan.batches.filter(b=>b.station===leg),cutoff=batches.at(-1).time;
  const local=empty(),arrivals=batches[0].localArrivalTimes??[],last=batches.at(-1);
  local.arrived=arrivals.length;local.served=last.localServedTotal??0;local.unserved=local.arrived-local.served;local.waits=batches.flatMap(b=>b.localWaits??[]);local.lowerWaitSum=local.waits.reduce((a,b)=>a+b,0)+arrivals.slice(local.served).reduce((a,t)=>a+cutoff-t,0);
  observations[leg+' 本地']=local;
  const transfer=empty(),branch=leg.includes('C→')?leg.at(-1):leg[0],isC=leg.startsWith('C');
  for(const r of plan.rows.filter(r=>r.branch===branch&&(isC||r.destination==='B'))){const a=isC?r.arrivalC:r.arrivalHub,d=isC?r.departC:r.departHub;if(a===null)continue;if(a>cutoff){transfer.afterCutoff++;continue}transfer.arrived++;if(d!==null&&d<=cutoff){transfer.served++;transfer.waits.push(d-a);transfer.lowerWaitSum+=d-a}else{transfer.unserved++;transfer.lowerWaitSum+=cutoff-a}}
  observations[leg+' 中转']=transfer;
 }return observations;
}
export function repeatBranch(plan,{runs=100,seed=24,longWait=15,excludeSeeds=[]}={},onProgress=()=>{}){
 if(!Number.isInteger(runs)||runs<1||runs>1000||!Number.isInteger(seed)||seed<0||seed>4294967295||!Number.isFinite(longWait)||longWait<0)throw new Error('重复次数须为1–1000整数，种子须为uint32，长等待阈值须为非负数');
 const p=plan.p;
 const expected=[['departuresC','localRateC'],['departuresCE','localRateCE'],['departuresD','localRateD'],['departuresEB','localRateEB']].reduce((v,[t,r])=>v+p[r]*(p[t].at(-1)-Math.max(0,p[t][0]-p.localWarmup)),0)*runs;
 if(p.capacityMode===3&&expected>2000000)throw new Error('预计样本超过200万架，请降低次数、到达率或时段');
 const seeds=trialSeeds(seed,runs,excludeSeeds);
 const groups={},trials=[],energies=[],nets=[],targetWaits=[];let arrivedB=0,feasible=0;
 for(let i=0;i<runs;i++){
  const batchSeed=seeds[i],trial=simulateBranch({...p,batchSeed},plan.economics),obs=observePlan(trial);
  let arrived=0,unserved=0;for(const [key,v]of Object.entries(obs)){
   const g=groups[key]??(groups[key]={...empty(),ratios:[]});for(const k of ['arrived','served','unserved','afterCutoff','lowerWaitSum'])g[k]+=v[k];for(const w of v.waits)g.waits.push(w);if(v.arrived)g.ratios.push(v.unserved/v.arrived);arrived+=v.arrived;unserved+=v.unserved;
  }
  const e=trial.economics,complete=trial.target.arrivalB!==null;if(complete){arrivedB++;energies.push(e.energy);targetWaits.push(trial.target.waitC+trial.target.waitHub)}if(e.feasibleTask){feasible++;nets.push(e.net)}
  trials.push({run:i+1,seed:batchSeed,arrived,unserved,arrivalB:trial.target.arrivalB,energy:e.energy,net:e.net,feasible:e.feasibleTask,totalWait:complete?trial.target.waitC+trial.target.waitHub:null});
  if(i%10===0||i===runs-1)onProgress(i+1,runs);
 }
 const rows=Object.entries(groups).map(([key,g])=>({key,arrived:g.arrived,served:g.served,unserved:g.unserved,afterCutoff:g.afterCutoff,meanWait:mean(g.waits),p95:quantile(g.waits),maxWait:g.waits.length?g.waits.reduce((a,b)=>Math.max(a,b),0):null,longShare:g.waits.length?g.waits.filter(w=>w>longWait).length/g.waits.length:null,unservedShare:g.arrived?g.unserved/g.arrived:null,lowerMean:g.arrived?g.lowerWaitSum/g.arrived:null,unservedCI:proportionCI(g.ratios),histogram:[5,10,20,40,Infinity].map((hi,i)=>g.waits.filter(w=>w>=(i?[5,10,20,40][i-1]:0)&&w<hi).length)}));
 return {configuration:{parameters:p,runs,seed,longWait,excludeSeeds,fixedRoute:plan.target.branch,fixedTask:{dC:plan.economics.dC,lC:plan.economics.lC,lD:plan.economics.lD,workC:plan.economics.workC,workD:plan.economics.workD}},runs,seed,longWait,mode:p.capacityMode,route:plan.target.branch,task:{dC:plan.economics.dC,lC:plan.economics.lC,lHub:plan.economics.lD},rows,trials,target:{arrivedB,feasible,meanEnergy:mean(energies),meanNet:mean(nets),meanWait:mean(targetWaits),p95Wait:quantile(targetWaits)}};
}
