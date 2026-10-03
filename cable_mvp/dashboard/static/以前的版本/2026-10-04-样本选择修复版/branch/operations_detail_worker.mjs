import {replayReview} from './operations_detail.mjs?v=20261003-network28';
self.onmessage=({data})=>{try{self.postMessage({trial:replayReview(data.report,data.kind,data.scenario,data.index)})}catch(e){self.postMessage({error:e.message})}};
