import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import assert from 'node:assert/strict';

const window={};
runInNewContext(readFileSync(new URL('../web_model.js',import.meta.url),'utf8'),{window,structuredClone});
const web=window.AirportWeb,frames=[];
let state=web.request('/api/sim/start',structuredClone(web.default));
frames[state.minute]=state.metrics;
while(!state.done){state=web.request('/api/sim/step',{session_id:state.session_id});frames[state.minute]=state.metrics}
const keys=['cargo_handled_kg','net_yuan','operating_cost_yuan','maintenance_cost_yuan','repair_cost_yuan','truck_cost_yuan'];
for(const key of keys){
  let sum=0;
  for(let hour=0;hour<24;hour++)sum+=frames[(hour+1)*60][key]-frames[hour*60][key];
  assert.ok(Math.abs(sum-(frames[1440][key]-frames[0][key]))<1e-6,key);
}
console.log('24 hourly boundary differences reconcile with the full-day simulation.');
