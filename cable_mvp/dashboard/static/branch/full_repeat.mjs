import {simulateFull} from './full_model.mjs?v=20261001-full10';
import {trialSeeds,quantile,proportionCI} from './repeated.mjs?v=20261001-full10';
export function repeatFull(plan,{runs=100,seed=24,longWait=15}={},progress=()=>{}){
 const seeds=trialSeeds(seed,runs);if(!Number.isFinite(longWait)||longWait<0)throw new Error('长等待阈值须为非负数');
 const trials=[],groups={};let generated=0,completed=0,kg=0;
 for(let i=0;i<runs;i++){
  const v=simulateFull({...plan.p,batchSeed:seeds[i]}),rates={};generated+=v.rows.length;completed+=v.networkSummary.completed;kg+=v.networkSummary.deliveredCargo;
  for(const leg of ['C→D','C→E','D→B','E→B'])for(const role of ['本地','中转']){
   const isC=leg.startsWith('C'),branch=isC?leg.at(-1):leg[0],origin=isC?'C':branch,batches=v.batches.filter(b=>b.station===leg),end=batches.at(-1).time,key=leg+' '+role,g=groups[key]??(groups[key]={arrived:0,served:0,unserved:0,afterCutoff:0,waits:[],lowerWaitSum:0,ratios:[]});let n=0,u=0;
   for(const r of v.rows.filter(r=>r.branch===branch&&(isC||r.destination==='B')&&((r.origin===origin)===(role==='本地')))){const a=isC?r.arrivalC:r.arrivalHub,d=isC?r.departC:r.departHub;if(a===null)continue;if(a>end){g.afterCutoff++;continue}n++;g.arrived++;if(d!==null&&d<=end){g.served++;g.waits.push(d-a);g.lowerWaitSum+=d-a}else{u++;g.unserved++;g.lowerWaitSum+=end-a}}
   if(n)g.ratios.push(u/n);
  }
  trials.push({run:i+1,seed:seeds[i],generated:v.rows.length,completed:v.networkSummary.completed,deliveredCargo:v.networkSummary.deliveredCargo,hasTarget:!!v.target,targetFeasible:!!v.economics});if(i%10===0||i===runs-1)progress(i+1,runs);
 }
 const mean=v=>v.length?v.reduce((a,b)=>a+b,0)/v.length:null;
 return {configuration:{parameters:plan.p,runs,seed,longWait},runs,seed,longWait,mode:3,fullNetwork:true,generated,completed,meanDeliveredCargo:kg/runs,uncompletedShare:generated?(generated-completed)/generated:null,rows:Object.entries(groups).map(([key,g])=>({...g,key,meanWait:mean(g.waits),p95:quantile(g.waits),longShare:g.waits.length?g.waits.filter(w=>w>longWait).length/g.waits.length:null,unservedShare:g.arrived?g.unserved/g.arrived:null,lowerMean:g.arrived?g.lowerWaitSum/g.arrived:null,unservedCI:proportionCI(g.ratios),histogram:[5,10,20,40,Infinity].map((hi,i)=>g.waits.filter(w=>w>=(i?[5,10,20,40][i-1]:0)&&w<hi).length)})),trials};
}
