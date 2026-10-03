import {runUnified} from './unified.mjs?v=20261003-network28';
self.onmessage=({data})=>{try{const start=performance.now(),result=runUnified(data.plan,data.options,(phase,done,total)=>self.postMessage({phase,done,total}));result.runtimeMs=performance.now()-start;self.postMessage({result})}catch(e){self.postMessage({error:e.message})}};
