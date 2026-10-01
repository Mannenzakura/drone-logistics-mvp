import {fourStudies} from './four_studies.mjs?v=20261001-service7';
onmessage=({data})=>{try{postMessage({result:fourStudies(data.plan,data.options)})}catch(error){postMessage({error:error.message})}};
