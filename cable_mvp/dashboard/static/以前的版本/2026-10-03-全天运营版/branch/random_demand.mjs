import {winchTimes} from '../four_model.mjs?v=20261003-network24';
import {generateLocalArrivals} from '../local_queue.mjs?v=20261003-network24';
export const RANDOM_DEFAULTS={demandMode:0,sourceEnd:24,sourceRateA:.2,sourceRateCD:.08,sourceRateCE:.08,sourceRateD:.08,sourceRateE:.08,destinationBShare:.6,branchDShare:.5,cargoMin:1,cargoMax:5,medicalShare:.1,expressShare:.3,medicalFeeFactor:1.8,expressFeeFactor:1.3};
export function validateSources(p){
 if(![0,1].includes(p.demandMode))throw new Error('需求模式须为0固定算例或1全入口随机');
 for(const k of ['sourceEnd','sourceRateA','sourceRateCD','sourceRateCE','sourceRateD','sourceRateE','cargoMin','cargoMax','medicalFeeFactor','expressFeeFactor'])if(!Number.isFinite(p[k])||p[k]<0)throw new Error(k+'须为非负有限数');
 if(p.sourceEnd>1440||p.sourceRateA>20||p.sourceRateCD>20||p.sourceRateCE>20||p.sourceRateD>20||p.sourceRateE>20||p.cargoMax>20||p.cargoMin>p.cargoMax)throw new Error('源需求时段/到达率/货量超出上限，或货量上下限颠倒');
 for(const k of ['destinationBShare','branchDShare','medicalShare','expressShare'])if(!Number.isFinite(p[k])||p[k]<0||p[k]>1)throw new Error(k+'须在0–1');
 if(p.medicalShare+p.expressShare>1)throw new Error('医疗和快件比例之和不可超过1');
}
export function generateDemand(p){validateSources(p);const jobs=[];for(const [origin,branch,rate,salt]of [['A',null,p.sourceRateA,711],['C','D',p.sourceRateCD,722],['C','E',p.sourceRateCE,733],['D','D',p.sourceRateD,744],['E','E',p.sourceRateE,755]]){
 const profile=p.hourlyDemandProfile; if(profile&&(!Array.isArray(profile)||profile.length!==24||profile.some(x=>!Number.isFinite(x)||x<0||x>10)))throw new Error("小时需求系数须为24个0–10数值");
 const times=profile?profile.flatMap((factor,h)=>generateLocalArrivals((p.batchSeed^salt^Math.imul(h+1,104729))>>>0,rate*factor,h*60,Math.min(p.sourceEnd,(h+1)*60))):generateLocalArrivals((p.batchSeed^salt)>>>0,rate,0,p.sourceEnd);let state=(p.batchSeed^salt^1234567)>>>0;const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return (state+.5)/4294967296};
 for(const created of times){const b=branch??(rand()<p.branchDShare?'D':'E'),destination=['D','E'].includes(origin)?'B':rand()<p.destinationBShare?'B':b,weight=p.cargoMin+(p.cargoMax-p.cargoMin)*rand(),typeDraw=rand(),cargoType=typeDraw<p.medicalShare?'医疗':typeDraw<p.medicalShare+p.expressShare?'快件':'普通',feeFactor=cargoType==='医疗'?p.medicalFeeFactor:cargoType==='快件'?p.expressFeeFactor:1;
 const dropC=origin==='A'?rand()*Math.min(p.bay,1.5):0,loadC=origin==='A'&&destination==='B'?rand()*Math.min(p.bay,2):0,loadHub=['A','C'].includes(origin)&&destination==='B'?rand()*Math.min(p.bay,2):0;
 const workC=origin==='C'?winchTimes(p,0,weight,0).workC:origin==='A'?winchTimes(p,dropC,loadC,loadHub).workC:0;
 const workHub=['D','E'].includes(origin)?winchTimes(p,0,0,weight).workD:destination===b?winchTimes(p,0,weight+loadC,0).workD:winchTimes(p,dropC,loadC,loadHub).workD;
 jobs.push({origin,branch:b,destination,created,weight,cargoType,feeFactor,dropC,loadC,loadHub,workC,workHub});if(jobs.length>(p.maxJobs??128))throw new Error('随机样本超过'+(p.maxJobs??128)+'架，请降低到达率或时段；未截断或重抽样');
 }}return jobs.sort((a,b)=>a.created-b.created||a.origin.localeCompare(b.origin)).map((j,id)=>({...j,id}));}
