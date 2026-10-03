import {assessEvent,pairedInterval} from './joint_event_assess.mjs?v=20261003-network25';
import {generateDemand} from './random_demand.mjs?v=20261003-network25';
import {trialSeeds} from './repeated.mjs?v=20261003-network25';
export function surfaceStudy(p,mission,c,o,exploreSeeds,excluded,buildInput,progress=()=>{}){
 if(!o.surfaceModel)return null;
 const configs=[{name:'当前起降设施',pads:o.padCount,channels:o.movementChannels},...(o.padCount<20?[{name:'每站增加1个停机位',pads:o.padCount+1,channels:o.movementChannels}]:[]),...(o.movementChannels<10?[{name:'每站增加1条起降通道',pads:o.padCount,channels:o.movementChannels+1}]:[]),...(o.padCount<20&&o.movementChannels<10?[{name:'每站各增加1位与1通道',pads:o.padCount+1,channels:o.movementChannels+1}]:[])];
 const backgrounds=exploreSeeds.map(batchSeed=>generateDemand({...p,batchSeed})),freshSeeds=trialSeeds(o.surfaceSeed,o.runs,excluded),fresh=freshSeeds.map(batchSeed=>generateDemand({...p,batchSeed}));
 const assess=(config,seeds,jobs)=>{const result=assessEvent(p,mission,jobs,seeds,c,{...o,padCount:config.pads,movementChannels:config.channels},buildInput,true);return {config,result,meanPadWait:result.trials.reduce((a,t)=>a+t.padWait,0)/seeds.length,meanMovementWait:result.trials.reduce((a,t)=>a+t.movementWait,0)/seeds.length}};
 const exploration=configs.map((config,i)=>{progress('起降设施探索',i+1,configs.length);return assess(config,exploreSeeds,backgrounds)}),choice=exploration.filter(x=>x.result.passed).sort((a,b)=>b.result.meanNetworkNet-a.result.meanNetworkNet)[0]??null;
 // Fixed alternatives on the new sample are descriptive; never reselect from them.
 const alternatives=configs.map(config=>assess(config,freshSeeds,fresh)),reference=alternatives[0],chosen=choice?alternatives.find(x=>x.config.name===choice.config.name):null;
 let review=null;if(chosen){const gain=pairedInterval(chosen.result.trials.map((t,i)=>t.networkNet-reference.result.trials[i].networkNet)),ordinaryChange=pairedInterval(chosen.result.trials.map((t,i)=>t.ordinaryUnservedShare-reference.result.trials[i].ordinaryUnservedShare));review={gain,ordinaryChange,passed:chosen.config.name!==reference.config.name&&chosen.result.passed&&gain.low!==null&&gain.low>0&&ordinaryChange.high!==null&&ordinaryChange.high<=o.ordinaryTolerance};}
 return {candidate:c,configs,exploration,choice,alternatives,reference,chosen,review,freshSeeds,scope:'固定本轮路线、装卸与充电策略，探索有限设施组合后用第七组独立样本复核；没有重新优化路线和货量，不提供全局最优或实测认证。'};
}
