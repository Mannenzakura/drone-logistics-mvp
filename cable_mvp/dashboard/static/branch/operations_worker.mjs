import {runOperations} from './operations.mjs';
self.onmessage=({data})=>{try{const result=runOperations(data.plan,data.options,(phase,done,total)=>self.postMessage({phase,done,total}));self.postMessage({result})}catch(error){self.postMessage({error:error.message})}};
