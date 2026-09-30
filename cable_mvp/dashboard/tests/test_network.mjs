import assert from 'node:assert/strict';
import {EXAMPLE,boardFifo,simulateNetwork} from '../static/network/engine.mjs';

const stable=simulateNetwork({...EXAMPLE,arrivalJitter:0,serviceJitterC:0,transitJitter:0,serviceJitterD:0,cancelChance:0});
assert.deepEqual(stable.scenario.flights,stable.baseline.flights);
assert.equal(stable.summary.meanDelayB,0);
const blocked=boardFifo([{id:0,arrival:0,ready:5,departure:null},{id:1,arrival:1,ready:1,departure:null}],
  [{time:2,cancelled:false},{time:6,cancelled:false}],1,'C');
assert.equal(blocked.flights[0].departure,6);
assert.equal(blocked.flights[1].departure,null);
assert.ok(blocked.events.some(e=>e.type==='blocked'&&e.time===2));
const run=simulateNetwork(EXAMPLE);
assert.deepEqual(run,simulateNetwork(EXAMPLE));
assert.ok(run.comparisons.some(f=>f.delayD>f.delayC));
assert.ok(run.scenario.events.some(e=>e.station==='B'));
assert.throws(()=>simulateNetwork({...EXAMPLE,seatsC:0}));
assert.throws(()=>simulateNetwork({...EXAMPLE,serviceD:[0]}));
console.log('Two-transfer FIFO, propagation, deterministic replay and validation passed.');
