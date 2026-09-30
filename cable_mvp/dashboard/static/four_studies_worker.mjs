import {fourStudies} from './four_studies.mjs?v=20260930-batch1';
onmessage=({data})=>{try{postMessage({result:fourStudies(data.plan,data.options)})}catch(error){postMessage({error:error.message})}};
