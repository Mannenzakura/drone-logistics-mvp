import {runMedical} from './medical_study.mjs?v=20261004-network29';
self.onmessage=({data})=>{try{const t=performance.now(),result=runMedical(data.plan,data.options,(phase,done,total)=>self.postMessage({phase,done,total}));result.runtimeMs=performance.now()-t;self.postMessage({result})}catch(e){self.postMessage({error:e.message})}};
