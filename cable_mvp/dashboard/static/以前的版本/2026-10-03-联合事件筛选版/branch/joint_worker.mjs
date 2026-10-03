import {jointStudy} from './joint.mjs?v=20261003-network21';
self.onmessage=({data})=>{try{const start=performance.now();const result=jointStudy(data.plan,data.options,(phase,done,total)=>{if(done%5===0||done===total)self.postMessage({phase,done,total})});result.runtimeMs=performance.now()-start;self.postMessage({result});}catch(e){self.postMessage({error:e.message});}};
