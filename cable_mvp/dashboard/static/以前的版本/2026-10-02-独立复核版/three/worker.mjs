import {simulate,formationTiming} from './model.mjs?v=20260929-fifo2';
self.onmessage=({data})=>{
  try{self.postMessage({result:data.task==='timing'?formationTiming(data.parameters):simulate(data)});}
  catch(error){self.postMessage({error:error instanceof Error?error.message:'计算失败'});}
};
