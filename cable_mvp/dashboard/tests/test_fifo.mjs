import assert from 'node:assert/strict';
import {assignFifo,assignWithDeferral,averageWaitApprox} from '../static/fifo.mjs';
import {DEFAULTS,simulate} from '../static/model.mjs';

const schedule=assignFifo([0,1,2,5,6],[4,8,12,16],2);
assert.deepEqual(schedule.map(x=>x.wait),[4,3,6,3,6]);
assert.equal(schedule[2].departure,8);
assert.equal(schedule[2].seat,1);
assert.equal(assignFifo([0,0,0],[1],2)[2].wait,null);
assert.throws(()=>assignFifo([0],[2,1],1));
const delayed=assignWithDeferral([0,1,2,5,6],[4,8,12,16],2,2,12);
assert.equal(delayed[2].departure,12);
assert.equal(delayed[3].departure,8);
assert.equal(delayed[4].departure,8);
assert.equal(new Set(delayed.filter(x=>x.departure!==null).map(x=>`${x.batch}:${x.seat}`)).size,5);
const approx=averageWaitApprox(.25,4,2);
assert.equal(approx.utilization,.5);
assert.equal(approx.wait,3);
assert.equal(averageWaitApprox(.5,4,2).wait,null);
const p=DEFAULTS, wait=schedule[2].wait, energy=wait*p.cruise_empty*p.speed/60;
for(const eta of [.05,.1,.15]){
  const x=simulate({parameters:{...p,W:wait-p.join_buffer,G:p.G-energy,eta},mode:'optimal'});
  assert.equal(x.valid,true);
  assert.ok(x.operation_time<=wait-p.join_buffer+1e-9);
  assert.ok(x.incremental_energy<=x.formation.available_energy+1e-9);
}
// With negligible waiting cost and enough energy, deferring can create a
// longer work window and raise the value of a C-point cargo exchange.
const p2={...p,cruise_empty:0,G:1,time_q:0,time_d:0,time_l:0};
const choices=[8,12,16].map(earliest=>{
  const rows=assignWithDeferral([0,1,2,5,6],[4,8,12,16],2,2,earliest);
  const wait=rows[2].wait;
  const result=simulate({parameters:{...p2,W:wait-p2.join_buffer},mode:'optimal'});
  return {departure:rows[2].departure,score:result.economics.transfer_net_benefit};
});
assert.equal(choices.sort((a,b)=>b.score-a.score||a.departure-b.departure)[0].departure,12);
console.log('FIFO assignment, approximation and three linked optimization cases passed.');
