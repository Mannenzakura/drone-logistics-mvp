import {pairedRouteStudy} from './paired_routes.mjs?v=20261002-policy16';
self.onmessage=({data})=>{try{const result=pairedRouteStudy(data.plan,data.options,(phase,done,total)=>self.postMessage({phase,done,total}));self.postMessage({result})}catch(e){self.postMessage({error:e.message})}};
