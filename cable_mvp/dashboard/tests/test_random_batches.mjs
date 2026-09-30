import assert from 'node:assert/strict';
import {stationTrips,validateBatchCapacity} from '../static/batch_capacity.mjs';
import {FOUR_DEFAULTS,optimizeFour} from '../static/four_model.mjs';
const p={...FOUR_DEFAULTS,capacityMode:2};
validateBatchCapacity(p);
assert.deepEqual(stationTrips(p,'C'),stationTrips(p,'C'));
assert.notDeepEqual(stationTrips(p,'C'),stationTrips({...p,batchSeed:p.batchSeed+1},'C'));
assert.ok(stationTrips({...p,localProbabilityC:1},'C').every(t=>t.seats===0));
assert.ok(stationTrips({...p,localProbabilityC:0},'C').every(t=>t.local===1&&t.seats===9));
for(const stationCount of [4,5]){const plan=optimizeFour({...p,stationCount,battery:8});assert.ok(plan.schedule.batches.every(b=>b.boarded<=b.capacity));}
assert.throws(()=>validateBatchCapacity({...p,localProbabilityC:1.1}));
console.log('Seed reproducibility, changed seed, probability limits, four/five station optimization passed');
