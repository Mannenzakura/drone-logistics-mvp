import {repeatBranch} from './repeated.mjs?v=20261001-repeat8';
self.onmessage=({data})=>{try{const result=repeatBranch(data.plan,data.options,(done,total)=>self.postMessage({progress:done,total}));self.postMessage({result})}catch(e){self.postMessage({error:e.message})}};
