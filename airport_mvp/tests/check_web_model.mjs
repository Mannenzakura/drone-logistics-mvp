import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const window = {};
runInNewContext(readFileSync(new URL('../web_model.js', import.meta.url), 'utf8'), {window,structuredClone});
const web = window.AirportWeb;
const raw = structuredClone(web.default);
let js = web.request('/api/sim/start', raw);
assert.equal(raw.flights.length,116);
const keep = t => t<=16 || [30,31,35,60,360,361,480,720,1080,1320,1365,1430,1435,1440].includes(t);
const snapshots = [js];
while (!js.done) {
  if (js.minute === 1) js = web.request('/api/sim/action', {session_id:js.session_id,action:'pad_fault'});
  if (js.minute === 5) js = web.request('/api/sim/action', {session_id:js.session_id,action:'pad_restore'});
  js = web.request('/api/sim/step', {session_id:js.session_id});
  if(keep(js.minute))snapshots.push(js);
}
const program = `import json
from model import DEFAULT
from live_model import AirportSimulation
s=AirportSimulation(DEFAULT)
rows=[s.step(compact=True)]
while not s.done:
    if s.minute==1:s.action('pad_fault')
    if s.minute==5:s.action('pad_restore')
    r=s.step(compact=True)
    if r['minute']<=16 or r['minute'] in (30,31,35,60,360,361,480,720,1080,1320,1365,1430,1435,1440):rows.append(r)
print(json.dumps(rows,ensure_ascii=False))`;
const python = spawnSync('python', ['-c',program], {cwd:new URL('..',import.meta.url),encoding:'utf8',maxBuffer:32*1024*1024,env:{...process.env,PYTHONIOENCODING:'utf-8'}});
if(python.status!==0)throw Error(python.stderr);
const py = JSON.parse(python.stdout);
function compareApprox(a,b,path='root'){
  if(typeof a==='number'&&typeof b==='number'){assert.ok(Math.abs(a-b)<=.011,`${path}: ${a} vs ${b}`);return}
  if(Array.isArray(a)&&Array.isArray(b)){assert.equal(a.length,b.length,path);a.forEach((x,i)=>compareApprox(x,b[i],`${path}[${i}]`));return}
  if(a&&b&&typeof a==='object'&&typeof b==='object'){assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort(),path);for(const key of Object.keys(a))compareApprox(a[key],b[key],`${path}.${key}`);return}
  assert.deepEqual(a,b,path);
}
assert.equal(snapshots.length,py.length);
for(let i=0;i<py.length;i++){
  assert.equal(snapshots[i].minute,py[i].minute);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshots[i].timeline)),py[i].timeline);
  compareApprox(JSON.parse(JSON.stringify(snapshots[i].metrics)),py[i].metrics);
  compareApprox(JSON.parse(JSON.stringify(snapshots[i].flights)),py[i].flights);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshots[i].night)),py[i].night);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshots[i].incidents)),py[i].incidents);
}
console.log(`Browser and Python simulations match across ${py.length} minutes and two actions.`);
