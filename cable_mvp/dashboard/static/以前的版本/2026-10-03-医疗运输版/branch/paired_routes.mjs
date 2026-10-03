import {simulateBranch} from './model.mjs?v=20261003-network27';
import {repeatBranch,trialSeeds} from './repeated.mjs?v=20261003-network27';
export function wilson(success,total){if(!total)return {low:null,high:null};const z=1.96,p=success/total,den=1+z*z/total,center=(p+z*z/(2*total))/den,half=z*Math.sqrt(p*(1-p)/total+z*z/(4*total*total))/den;return {low:Math.max(0,center-half),high:Math.min(1,center+half)};}
export function pairedMean(v){if(!v.length)return {n:0,mean:null,low:null,high:null};const avg=v.reduce((a,b)=>a+b,0)/v.length;if(v.length<2||v.every(x=>x===v[0]))return {n:v.length,mean:avg,low:null,high:null};const variance=v.reduce((s,x)=>s+(x-avg)**2,0)/(v.length-1),half=1.96*Math.sqrt(variance/v.length);return {n:v.length,mean:avg,low:avg-half,high:avg+half};}
export function comparePaired(d,e){
 if(d.trials.length!==e.trials.length||d.trials.some((x,i)=>x.seed!==e.trials[i].seed))throw new Error('配对路线必须使用相同的逐次种子');
 const feasible=[],net=[],energy=[];let onlyD=0,onlyE=0,both=0,neither=0;
 d.trials.forEach((x,i)=>{const y=e.trials[i];feasible.push(Number(y.feasible)-Number(x.feasible));if(x.feasible&&y.feasible){both++;net.push(y.net-x.net);energy.push(y.energy-x.energy)}else if(x.feasible)onlyD++;else if(y.feasible)onlyE++;else neither++});
 return {onlyD,onlyE,both,neither,feasible:pairedMean(feasible),net:pairedMean(net),energy:pairedMean(energy)};
}
export function recommendRoute(candidates){const eligible=candidates.filter(c=>c.result?.target.feasible>0);return eligible.sort((a,b)=>b.result.target.feasible-a.result.target.feasible||b.result.target.meanNet-a.result.target.meanNet||(a.result.target.p95Wait??Infinity)-(b.result.target.p95Wait??Infinity)||a.branch.localeCompare(b.branch))[0]?.branch??null;}
export function pairedRouteStudy(plan,{runs=100,seed=24,validationSeed=100024,longWait=15}={},onProgress=()=>{}){
 trialSeeds(seed,runs);if(!Number.isFinite(longWait)||longWait<0)throw new Error('长等待阈值须为非负有限数');
 if(!Number.isInteger(validationSeed)||validationSeed<0||validationSeed>4294967295)throw new Error('复核总种子须为uint32');
 const candidates=['D','E'].map(branch=>{try{const branches=[...plan.p.branches];branches[plan.p.target]=branch;return {branch,plan:simulateBranch({...plan.p,branches})}}catch(error){return {branch,reason:error.message}}});
 const options={runs,seed,longWait,excludeSeeds:[plan.p.batchSeed]};
 for(const c of candidates)if(c.plan){onProgress('选择样本：经'+c.branch,0,runs);c.result=repeatBranch(c.plan,options,(done,total)=>onProgress('选择样本：经'+c.branch,done,total));c.interval=wilson(c.result.target.feasible,runs);}
 const recommendation=recommendRoute(candidates),selected=candidates.find(c=>c.branch===recommendation);let validation=null;
 if(selected){const excludeSeeds=[plan.p.batchSeed,...selected.result.trials.map(t=>t.seed)];validation=repeatBranch(selected.plan,{runs,seed:validationSeed,longWait,excludeSeeds},(done,total)=>onProgress('独立复核：经'+recommendation,done,total));validation.interval=wilson(validation.target.feasible,runs);}
 const d=candidates.find(c=>c.branch==='D'),e=candidates.find(c=>c.branch==='E');
 return {parameters:plan.p,options:{runs,seed,validationSeed,longWait},recommendation,currentRoute:plan.target.branch,candidates:candidates.map(({branch,reason,result,interval})=>({branch,reason,result,interval})),paired:d.result&&e.result?comparePaired(d.result,e.result):null,validation};
}
