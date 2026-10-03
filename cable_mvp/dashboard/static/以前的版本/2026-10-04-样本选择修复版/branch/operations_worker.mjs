import {runOperations} from './operations.mjs?v=20261003-network28';
self.onmessage=({data})=>{try{const result=runOperations(data.plan,data.options,(phase,done,total)=>self.postMessage({phase,done,total}));self.postMessage({result})}catch(error){self.postMessage({error:error.message})}};
