import {effectivePayload,winchTimes,evaluateFour,cruiseFour} from '../four_model.mjs?v=20261003-network27';
import {flowSchedule} from './network_flow.mjs?v=20261003-network27';
import {quantile} from './repeated.mjs?v=20261003-network27';
export function diagnoseJoint(p,c,deadline){
 const timing=winchTimes(p,c.dC,c.lC,c.lHub),limit=effectivePayload(p),mass=p.q+Math.max(c.dC,c.lC,c.lHub),schedule=flowSchedule(p,timing.workC,timing.workD),t=schedule.rows[p.target];let reason='成功',energy=null;
 if(mass>limit+1e-9||Math.max(c.dC,c.lC,c.lHub)>p.bay+1e-9)reason='载荷或仓容超限';
 else if(p.winchEnabled&&Math.max(c.dC,c.lC,c.lHub)>p.winchCapacity+1e-9)reason='绞盘容量超限';
 else if((p.sharedC&&(timing.workC>p.airspaceC||Number(c.dC+c.lC>0)>p.permitC))||(p.sharedD&&(timing.workD>p.airspaceD||Number(c.lC+c.lHub>0)>p.permitD)))reason='空域窗口或许可限制';
 else if(t.departC===null)reason=t.serviceEndC+(p.joinBuffer??0)>(p.fullSelectedBranch==='E'?p.departuresCE:p.departuresC).at(-1)?'C作业未及时就绪':'C班次容量或FIFO阻塞';
 else if(t.departD===null)reason=t.arrivalD+timing.workD+(p.joinBuffer??0)>(p.fullSelectedBranch==='E'?p.departuresEB:p.departuresD).at(-1)?'分支站到达或作业过晚':'分支班次容量或FIFO阻塞';
 else {const cruise=cruiseFour(p,t,c.dC,c.lC,c.lHub);energy=cruise.eAC+cruise.eCD+cruise.eDB+p.loiterRate*(t.waitC+t.waitD)+p.handlingEnergyC*Number(c.dC+c.lC>0)+p.handlingEnergyD*Number(c.lC+c.lHub>0);if(energy>p.battery-p.energyReserve+1e-9)reason='电量不足';else if(t.arrivalB>deadline)reason='超过交付期限';}
 let e=null;try{e=evaluateFour(p,c.dC,c.lC,c.lHub)}catch(error){if(reason==='成功')reason='模型参数或参考航程限制';}const success=!!e&&e.target.arrivalB<=deadline;if(success)reason='成功';else if(reason==='成功')reason='其他模型约束';
 const cCut=(p.fullSelectedBranch==='E'?p.departuresCE:p.departuresC).at(-1),hCut=(p.fullSelectedBranch==='E'?p.departuresEB:p.departuresD).at(-1);
 return {success,reason,arrival:t.arrivalB,energy,energyLimit:p.battery-p.energyReserve,serviceQueueC:t.serviceQueueC,workC:timing.workC,workHub:timing.workD,waitC:t.waitC,waitHub:t.waitD,batchWaitC:t.waitC===null?null:Math.max(0,t.waitC-t.serviceQueueC-timing.workC),batchWaitHub:t.waitD===null?null:Math.max(0,t.waitD-timing.workD),unservedLowerC:t.departC===null?Math.max(0,cCut-t.arrivalC):null,unservedLowerHub:t.arrivalD!==null&&t.departD===null?Math.max(0,hCut-t.arrivalD):null,deviceWaitPresent:t.serviceQueueC>0,departC:t.departC,departHub:t.departD,serviceEndC:t.serviceEndC};
}
export function summarizeDiagnostics(rows){const reasons={};for(const r of rows)reasons[r.reason]=(reasons[r.reason]??0)+1;const waits={};for(const k of ['serviceQueueC','batchWaitC','batchWaitHub']){const values=rows.map(r=>r[k]).filter(x=>x!==null);waits[k]={n:values.length,mean:values.length?values.reduce((s,v)=>s+v,0)/values.length:null,p95:quantile(values),histogram:[5,10,20,40,Infinity].map((hi,i)=>values.filter(v=>v>=(i?[5,10,20,40][i-1]:0)&&v<hi).length)};}return {runs:rows.length,failures:rows.filter(r=>!r.success).length,reasons,waits,failedWithDeviceWait:rows.filter(r=>!r.success&&r.deviceWaitPresent).length,cUnserved:rows.filter(r=>r.unservedLowerC!==null).length,hubUnserved:rows.filter(r=>r.unservedLowerHub!==null).length};}
