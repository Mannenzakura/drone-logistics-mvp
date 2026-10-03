import {repeatFull} from './full_repeat.mjs?v=20261004-network29';
import {repeatBranch} from './repeated.mjs?v=20261004-network29';
self.onmessage=({data})=>{try{const result=(data.plan.p.demandMode===1?repeatFull:repeatBranch)(data.plan,data.options,(done,total)=>self.postMessage({progress:done,total}));self.postMessage({result})}catch(e){self.postMessage({error:e.message})}};
