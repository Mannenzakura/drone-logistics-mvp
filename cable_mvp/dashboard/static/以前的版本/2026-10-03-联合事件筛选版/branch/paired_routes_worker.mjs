import {pairedRouteStudy} from './paired_routes.mjs?v=20261003-network21';
self.onmessage=({data})=>{try{const result=pairedRouteStudy(data.plan,data.options,(phase,done,total)=>self.postMessage({phase,done,total}));self.postMessage({result})}catch(e){self.postMessage({error:e.message})}};
