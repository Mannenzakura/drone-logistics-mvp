import {generateDemand} from './random_demand.mjs?v=20261003-network28';
import {simulateUnifiedDay} from './unified.mjs?v=20261003-network28';
import {jointInput,JOINT_DEFAULTS} from './joint.mjs?v=20261003-network28';
import {eventSchedule} from './event_network.mjs?v=20261003-network28';
import {networkLedger} from './network_economics.mjs?v=20261003-network28';
import {disruptionCalendar,hourlyMetrics,flightTrace} from './operations.mjs?v=20261003-network28';
export function replayReview(report,kind,scenario,index){
 const trial=report[scenario]?.trials[index];if(!trial)throw new Error('找不到对应复核样本');if(trial.schedule&&trial.hours&&trial.traces&&trial.disruptions)return trial;
 const p=report.parameters,opt=report.opt,seed=trial.seed,c=report[scenario].config,stress=['stress','stressReference'].includes(scenario),jobs=generateDemand({...p,batchSeed:seed});
 if(kind!=='operations')return {...trial,...simulateUnifiedDay(p,jobs,seed,c,opt,stress)};
 const o={...JOINT_DEFAULTS,...opt,deadline:report.simulationHorizon??1530,disruptions:stress?disruptionCalendar(seed,{...opt,horizon:report.simulationHorizon??1530}):[],padCount:opt.padCount+c.extraPad,movementChannels:opt.movementChannels+c.extraChannel},cp={...p,serviceEnabledC:1,serviceServersC:p.serviceServersC+c.extraDevice,energyPolicy:c.slots?'charge':'terminate',chargeSlots:c.slots,chargeStrategy:'next',connectionHold:c.hold};
 const times=offset=>Array.from({length:Math.floor((o.deadline-offset)/c.interval)+1},(_,i)=>offset+i*c.interval).filter(t=>t<o.deadline);cp.departuresC=times(10);cp.departuresCE=times(10);cp.departuresD=times(20+c.shift);cp.departuresEB=times(20+c.shift);
 const ip=jointInput(cp,{created:0,weight:0,feeFactor:1,cargoType:'普通'},jobs,{branch:'D',dC:0,lC:0,lHub:0});ip.fullJobs.pop();ip.target=-1;const schedule=eventSchedule(ip,0,0,o),ledger=networkLedger(ip,schedule,o);
 return {...trial,schedule,hours:hourlyMetrics(schedule,ledger),traces:schedule.rows.map(r=>flightTrace(schedule,r)),disruptions:o.disruptions};
}
