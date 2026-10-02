import {generateDemand} from './random_demand.mjs?v=20261002-joint12';
import {evaluateFour,winchTimes} from '../four_model.mjs?v=20261002-joint12';
import {trialSeeds} from './repeated.mjs?v=20261002-joint12';
import {wilson} from './paired_routes.mjs?v=20261002-joint12';
export const JOINT_DEFAULTS={runs:100,seed:3102,validationSeed:93102,reliability:.9,deadline:90,maxDrop:2,maxLoadC:2,maxLoadHub:2,step:1,failurePenalty:30};
export function jointOptions(input={}){const o={...JOINT_DEFAULTS,...input};trialSeeds(o.seed,o.runs);trialSeeds(o.validationSeed,o.runs);for(const k of ['reliability','deadline','maxDrop','maxLoadC','maxLoadHub','step','failurePenalty'])if(!Number.isFinite(o[k])||o[k]<0)throw new Error(k+'须为非负有限数');if(o.reliability>1||o.deadline<=0||o.step<=0||o.runs>300||Math.max(o.maxDrop,o.maxLoadC,o.maxLoadHub)>20)throw new Error('门槛0–1，期限/步长须大于0，次数≤300，货量上限≤20');return o;}
const grid=(max,step)=>{const n=Math.ceil(max/step);if(n>100)throw new Error('网格过细');return Array.from({length:n+1},(_,i)=>Math.min(max,i*step))};
export function evaluateJoint(p,mission,background,candidate){
 const {branch,dC,lC,lHub}=candidate,timing=winchTimes(p,dC,lC,lHub),target=background.length;
 if(target>=128)throw new Error('背景加追踪任务超过128架；请降低需求率或时段');
 const job={...mission,id:target,origin:'A',destination:'B',branch,dropC:dC,loadC:lC,loadHub:lHub,workC:timing.workC,workHub:timing.workD};
 const jobs=[...background,job],fee=mission.feeFactor??1;
 const input={...p,fullJobs:jobs,target,fullSelectedBranch:branch,fullCD:p.cd,fullCE:p.ce,fullDB:p.db,fullEB:p.eb,stationCount:4,soloIndependent:0,q:mission.weight,cd:branch==='D'?p.cd:p.ce,db:branch==='D'?p.db:p.eb,arrivalsC:jobs.map(j=>['A','C'].includes(j.origin)?j.created+(j.origin==='A'?p.ac/p.speed*60:0):0),backgroundServiceC:jobs.map(j=>j.workC),backgroundServiceD:jobs.map(j=>j.workHub),destinations:jobs.map(j=>j.destination==='B'?'B':'D'),feeQ:p.feeQ*fee,feeDropC:p.feeDropC*fee,feeLoadC:p.feeLoadC*fee,feeLoadD:p.feeLoadD*fee};
 return evaluateFour(input,dC,lC,lHub);
}
function assess(p,mission,backgrounds,seeds,candidate,o,detail=false){let successes=0,payoff=0,netSum=0,energySum=0;const trials=[];for(let i=0;i<seeds.length;i++){const e=evaluateJoint(p,mission,backgrounds[i],candidate),success=!!e&&e.target.arrivalB<=o.deadline,value=success?e.net:-o.failurePenalty;successes+=Number(success);payoff+=value;if(success){netSum+=e.net;energySum+=e.energy;}if(detail)trials.push({seed:seeds[i],success,arrival:e?.target.arrivalB??null,energy:e?.energy??null,net:e?.net??null,objectiveValue:value});}const interval=wilson(successes,seeds.length);return {...candidate,successes,runs:seeds.length,rate:successes/seeds.length,interval,passed:interval.low>=o.reliability,meanObjective:payoff/seeds.length,successMeanNet:successes?netSum/successes:null,successMeanEnergy:successes?energySum/successes:null,...(detail?{trials}:{})};}
export function jointStudy(plan,input={},progress=()=>{}){
 const o=jointOptions(input);if(plan.p.demandMode!==1||!plan.target)throw new Error('需要全入口随机模式中存在一架A→B追踪任务；可重新抽样或调整源需求');
 const p=plan.p,mission={...plan.target},seeds=trialSeeds(o.seed,o.runs,[p.batchSeed]),validationSeeds=trialSeeds(o.validationSeed,o.runs,[p.batchSeed,...seeds]);
 const ds=grid(Math.min(o.maxDrop,p.demandDropC),o.step),cs=grid(Math.min(o.maxLoadC,p.demandLoadC),o.step),hs=grid(Math.min(o.maxLoadHub,p.demandLoadD),o.step),count=2*ds.length*cs.length*hs.length;if(count>250)throw new Error('候选超过250，请增大搜索步长或减小货量上限');
 const backgrounds=seeds.map(batchSeed=>generateDemand({...p,batchSeed})),candidates=[];
 for(const branch of ['D','E'])for(const dC of ds)for(const lC of cs)for(const lHub of hs){candidates.push(assess(p,mission,backgrounds,seeds,{branch,dC,lC,lHub},o));progress('筛选',candidates.length,count);}
 candidates.sort((a,b)=>Number(b.passed)-Number(a.passed)||b.meanObjective-a.meanObjective||b.interval.low-a.interval.low||a.branch.localeCompare(b.branch));
 const selected=candidates.find(c=>c.passed)??null;let validation=null;
 if(selected){progress('独立复核',0,o.runs);const bg=validationSeeds.map(batchSeed=>generateDemand({...p,batchSeed}));validation=assess(p,mission,bg,validationSeeds,selected,o,true);progress('独立复核',o.runs,o.runs);}
 return {method:'finite-grid-enumeration',status:!selected?'no-screening-candidate':validation.passed?'validated-grid-candidate':'holdout-failed',parameters:p,mission,options:o,seeds,validationSeeds,candidates,selected,validation,recommendation:validation?.passed?selected:null,scope:'固定额外A→B任务，随机全入口背景；失败收益代理=-failurePenalty；95% Wilson下界筛选并独立复核，不是全网最优或真实可靠性认证'};
}
