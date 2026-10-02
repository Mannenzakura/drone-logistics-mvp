// Browser port of cable_mvp/solve.py and dashboard/server.py, 2026-09-25.
// No network, DOM, storage or external runtime dependency.
import {winchDerived} from './winch.mjs?v=20260929-fifo2';
export const CARGO_PROFILES = {
  standard: {label:'普通件',cargo_fee:8,time_value:.015,handling_cost:.25},
  express: {label:'时效件',cargo_fee:12,time_value:.05,handling_cost:.3},
  medical: {label:'医疗/高价值件',cargo_fee:16,time_value:.12,handling_cost:.4},
};
export const DEFAULTS = {
  reference_payload:20,reference_range:70,speed:108,distance_ac:30,distance_cb:40,equipment_mass:2,
  q:10,Q:18,B:5,D:5,L:5,W:6,H:6,a:1,t0:2,td:.4,tl:.6,e0:.1,ed:.04,el:.08,G:.65,
  bd:4,bl:3,F:5,join_buffer:.5,shared_airspace:1,cargo_fee:8,time_value:.015,handling_cost:.25,
  direct_distance:55,direct_payload_energy:.04,direct_fixed_cost:0,
  eta:.1,formation_size:3,formation_role:1,propulsion_share:.6,cruise_empty:.025,energy_price:1,
  fee_q:8,time_q:.015,handling_q:.25,fee_d:8,time_d:.015,handling_d:.25,fee_l:8,time_l:.015,handling_l:.25,
  allow_extrapolation:0,
  // —— 索降作业三段计时与绞盘/质量约束（2026-09-26 接续新增；默认不改变原有行为）——
  operation_mode:0,enforce_winch:0,winch_capacity:5,hardware_mass:1.764,box_mass:0,mount_mass:0,
  height:20,approach_min:0,transition_min:0,exit_min:0,exchange_fixed_min:0,exchange_per_kg_min:0,
  drop_ref_height:20,drop_ref_seconds_per_kg:20.5,drop_height_slope:.0175,
  pickup_ref_seconds_per_kg:20.5,pickup_height_slope:.0175,
};
const groups=['q','d','l'];
const record=x=>x!==null && typeof x==='object' && !Array.isArray(x);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const clamp=x=>Math.max(0,Math.min(1,x));
const gcd=(a,b)=>{a=a<0n?-a:a;while(b){[a,b]=[b,a%b];}return a;};
// Exact rational arithmetic for the small LP. UI and time series use Number.
class R {
  constructor(n,d=1n){if(d===0n)throw new Error('零分母');if(d<0n){n=-n;d=-d;}const g=gcd(n,d);this.n=n/g;this.d=d/g;}
  static from(x){if(x instanceof R)return x;const [mantissa,exp='0']=String(x).toLowerCase().split('e');const places=(mantissa.split('.')[1]||'').length;let n=BigInt(mantissa.replace('.','')),d=1n;const power=Number(exp)-places;if(power>=0)n*=10n**BigInt(power);else d=10n**BigInt(-power);return new R(n,d);}
  add(x){x=R.from(x);return new R(this.n*x.d+x.n*this.d,this.d*x.d);}
  sub(x){x=R.from(x);return new R(this.n*x.d-x.n*this.d,this.d*x.d);}
  mul(x){x=R.from(x);return new R(this.n*x.n,this.d*x.d);}
  div(x){x=R.from(x);return new R(this.n*x.d,this.d*x.n);}
  cmp(x){x=R.from(x);const v=this.n*x.d-x.n*this.d;return v<0n?-1:v>0n?1:0;}
  num(){const n=Number(this.n),d=Number(this.d);if(Number.isFinite(n)&&Number.isFinite(d))return n/d;const ns=(this.n<0n?-this.n:this.n).toString(),ds=this.d.toString();return (this.n<0n?-1:1)*Number(ns.slice(0,16))/Number(ds.slice(0,16))*10**((ns.length-Math.min(16,ns.length))-(ds.length-Math.min(16,ds.length)));}
}
export function solve(input){
  const p=Object.fromEntries(Object.entries(input).map(([k,v])=>[k,R.from(v)]));
  const better=(a,b)=>{for(let i=0;i<a.length;i++){const c=a[i].cmp(b[i]);if(c)return c>0;}return false;};
  let best=null;
  for(const z of [0,1]){
    if(input.shared_airspace && z>input.a)continue;
    const raw=[[-1,0,0],[0,-1,0],[1,0,p.D.mul(z)],[0,1,p.L.mul(z)],
      [1,0,p.B.mul(z)],[0,1,p.B.mul(z)],[1,0,p.Q.sub(p.q)],[0,1,p.Q.sub(p.q)],
      [p.td,p.tl,p.W.sub(p.t0.mul(z))],[p.ed,p.el,p.G.sub(p.e0.mul(z))]];
    if(input.shared_airspace)raw.push([p.td,p.tl,p.H.sub(p.t0.mul(z))]);
    const rows=raw.map(row=>row.map(x=>R.from(x)));
    for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
      const [a,b,c]=rows[i],[u,v,w]=rows[j],det=a.mul(v).sub(b.mul(u));
      if(det.n===0n)continue;
      const d=c.mul(v).sub(b.mul(w)).div(det),l=a.mul(w).sub(c.mul(u)).div(det);
      if(!rows.every(([x,y,cap])=>x.mul(d).add(y.mul(l)).cmp(cap)<=0))continue;
      const value=p.bd.mul(d).add(p.bl.mul(l)).sub(p.F.mul(z));
      const key=[value,R.from(-z),d.add(l).mul(-1),d.mul(-1)];
      if(!best||better(key,best.key))best={key,d,l,z,value};
    }
  }
  if(!best)throw new Error('当前参数下没有可行运输方案');
  return {d:best.d.num(),l:best.l.num(),z:best.z,value:best.value.num(),status:'exact_rational_vertex_enumeration'};
}

export function simulate(body={}){
  if(!record(body))throw new Error('请求必须是参数对象');
  const kind=body.cargo_type??'standard';
  if(typeof kind!=='string'||!own(CARGO_PROFILES,kind))throw new Error('货物类型不合法');
  const profile=CARGO_PROFILES[kind],p={...DEFAULTS,...Object.fromEntries(['cargo_fee','time_value','handling_cost'].map(k=>[k,profile[k]]))};
  const overrides=body.parameters??{},types=body.cargo_types??{};
  if(!record(overrides)||Object.keys(overrides).some(k=>!own(p,k)))throw new Error('包含未知参数');
  if(!record(types)||Object.keys(types).some(k=>!groups.includes(k)))throw new Error('货物组须为 q、d、l');
  const labels={};
  for(const g of groups){const k=types[g]??kind;if(typeof k!=='string'||!own(CARGO_PROFILES,k))throw new Error(`${g} 货物类型不合法`);labels[g]=CARGO_PROFILES[k].label;
    for(const [dest,src] of [['fee','cargo_fee'],['time','time_value'],['handling','handling_cost']])p[`${dest}_${g}`]=own(types,g)?CARGO_PROFILES[k][src]:(overrides[src]??profile[src]);}
  for(const [k,v] of Object.entries(overrides)){if(typeof v!=='number'||!Number.isFinite(v))throw new Error(`${k} 必须是有限数值`);if(Math.abs(v)>10000)throw new Error('参数超出仿真范围');p[k]=v;}
  for(const [k,v] of Object.entries(p))if(!['bd','bl'].includes(k)&&v<0)throw new Error(`${k} 不能为负数`);
  if(p.speed<=0||p.distance_ac<=0||p.distance_cb<=0)throw new Error('距离与巡航速度必须大于 0');
  if(![0,1].includes(p.a)||![0,1].includes(p.shared_airspace))throw new Error('空域参数必须为 0 或 1');
  if(![0,1].includes(p.allow_extrapolation))throw new Error('外推开关必须为 0 或 1');
  if(![0,1].includes(p.operation_mode))throw new Error('作业计时模式必须为 0（单次悬停换货）或 1（三段计时）');
  if(![0,1].includes(p.enforce_winch))throw new Error('绞盘约束开关必须为 0 或 1');
  const m=p.formation_size,role=p.formation_role;
  if(!Number.isInteger(m)||m<1||m>8||![0,1,2,3].includes(role))throw new Error('编队规模须为1–8的整数，角色不合法');
  if(p.eta>1||p.propulsion_share>1)throw new Error('减阻参数与气动能耗占比须在0到1之间');
  const a=role===1?(m-1)/m:role===2?((m-1)/m)**2:0;
  const gamma=1-p.propulsion_share*p.eta*a,ad=p.ed*p.distance_ac/30,al=p.el*p.distance_cb/40;
  const baseline_saving=(1-gamma)*(p.cruise_empty*p.distance_cb+al*p.q);
  const formation={gamma,drag_reduction:p.eta*a,ad,al_solo:al,al_form:gamma*al,baseline_saving,
    available_energy:p.G+baseline_saving,bd:p.bd+p.energy_price*(p.ed-ad),bl:p.bl+p.energy_price*(p.el-gamma*al)};
  const distance=p.distance_ac+p.distance_cb;
  const extrapolated=p.allow_extrapolation===1&&distance>110;
  if(distance>110&&!p.allow_extrapolation)throw new Error('总航程超出原文 110 km 适用范围；如需继续探索可勾选“允许航程外推”');
  const reference=Math.min(20,37.5-distance/4),effective_q=Math.min(p.Q,reference-p.equipment_mass);
  if(effective_q<p.q)throw new Error(`固定货物 ${p.q} kg 已超过本情景参考净载荷 ${effective_q.toFixed(2)} kg`);
  // —— 索降作业三段计时与绞盘/质量预算 ——
  // 先折算成等效的 (t0, td, tl, D, L)，再交给同一个精确顶点枚举求解器，避免出现第二套求解逻辑。
  const wl=winchDerived(p);
  const t0Eff=p.operation_mode===1?wl.t_fixed_min:p.t0;
  const tdEff=p.operation_mode===1?wl.time_per_kg_d:p.td;
  const tlEff=p.operation_mode===1?wl.time_per_kg_l:p.tl;
  const massBudget=effective_q-p.hardware_mass-p.box_mass-p.mount_mass;
  const winchCapD=p.enforce_winch===1?Math.max(0,Math.min(p.winch_capacity,p.D,massBudget)):p.D;
  const winchCapL=p.enforce_winch===1?Math.max(0,Math.min(p.winch_capacity,p.L,massBudget)):p.L;
  const winch={operation_mode:p.operation_mode,enforce_winch:p.enforce_winch,
    t_fixed_min:t0Eff,time_per_kg_d:tdEff,time_per_kg_l:tlEff,
    tau_drop_per_kg:wl.tau_drop_per_kg,tau_pickup_per_kg:wl.tau_pickup_per_kg,tau_clamped:wl.tau_clamped,
    mass_budget:massBudget,cap_d:winchCapD,cap_l:winchCapL,
    reference_height:p.drop_ref_height,public_anchor:'(2 kg,20 m)=41 s 与 (2 kg,30 m)=62 s 定出高度律'};
  const model={...p,Q:effective_q,D:winchCapD,L:winchCapL,t0:t0Eff,td:tdEff,tl:tlEff,
    ed:ad,el:formation.al_form,G:formation.available_energy,bd:formation.bd,bl:formation.bl};
  const operational=solve(model);
  const times={d:p.distance_ac/p.speed*60,l:p.W+p.join_buffer+p.distance_cb/p.speed*60};times.q=times.d+times.l;
  const econModel={...model,bd:p.fee_d-p.handling_d-p.time_d*times.d-p.energy_price*ad,
    bl:p.fee_l-p.handling_l-p.time_l*times.l-p.energy_price*formation.al_form,F:p.F+p.energy_price*p.e0};
  const optimum=solve(econModel),mode=body.mode??'optimal';
  if(!['optimal','manual'].includes(mode))throw new Error('未知方案模式');
  let {d,l,z}=optimum;
  if(mode==='manual'){d=body.d??0;l=body.l??0;if([d,l].some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>10000))throw new Error('手动装卸量应为非负有限数值');z=d+l>0?1:0;}
  const duration=t0Eff*z+tdEff*d+tlEff*l,energy=p.e0*z+ad*d+formation.al_form*l;
  const cb_solo=p.cruise_empty*p.distance_cb+al*(p.q+l);
  Object.assign(formation,{cb_solo,cb_form:gamma*cb_solo,saving:(1-gamma)*cb_solo});
  const directReference=Math.min(20,37.5-p.direct_distance/4),directPayload=Math.min(p.Q,directReference-p.equipment_mass);
  let direct;
  if(p.direct_distance<=0||(p.direct_distance>110&&!p.allow_extrapolation)||directPayload<p.q)direct={feasible:false,reason:'直飞航程或固定货物超出当前参考范围',extra_kg:0,mass_kg:0,time_min:0,energy_kwh:0,revenue:0,time_cost:0,operating_cost:0,net_benefit:null};
  else{const t=p.direct_distance/p.speed*60,e=p.cruise_empty*p.direct_distance+p.direct_payload_energy*p.q,revenue=p.fee_q*p.q,time_cost=p.time_q*t*p.q,operating_cost=p.energy_price*e+p.direct_fixed_cost+p.handling_q*p.q;
    direct={feasible:true,reason:'',extra_kg:0,mass_kg:p.q,time_min:t,energy_kwh:e,revenue,time_cost,operating_cost,net_benefit:revenue-time_cost-operating_cost};}
  const masses={q:p.q,d,l};
  const cargo_rows=groups.map(g=>({group:g,label:labels[g],mass:masses[g],fee:p[`fee_${g}`],revenue:masses[g]*p[`fee_${g}`],time_min:times[g],time_cost:masses[g]*p[`time_${g}`]*times[g],handling_cost:masses[g]*p[`handling_${g}`]}));
  const sum=k=>cargo_rows.reduce((v,c)=>v+c[k],0);
  const transfer_energy_kwh=p.cruise_empty*p.distance_ac+ad*(p.q+d)+p.e0*z+formation.cb_form;
  const transfer_operating_cost=p.energy_price*transfer_energy_kwh+p.F*z+sum('handling_cost');
  const transfer_net_benefit=sum('revenue')-sum('time_cost')-transfer_operating_cost;
  const economics={cargo_type:kind,cargo_label:new Set(Object.values(labels)).size===1?labels.q:'分组货物',cargo_rows,transfer_mass:p.q+d+l,
    transfer_revenue:sum('revenue'),transfer_time_cost:sum('time_cost'),transfer_energy_kwh,transfer_operating_cost,transfer_net_benefit,direct,
    delta_vs_direct:direct.net_benefit===null?null:transfer_net_benefit-direct.net_benefit};
  const checks=[],check=(name,used,limit,unit)=>checks.push({name,used,limit,unit,ok:used<=limit+1e-9});
  const skip=(name,unit)=>checks.push({name,used:0,limit:null,unit,ok:true,applicable:false});
  check('衔接时间',duration,p.W,'min');
  if(p.shared_airspace)check('机场共享空域窗口',duration,p.H,'min');else skip('机场共享空域窗口','min');
  check('新增能量（含基准节能余量）',energy,formation.available_energy,'kWh');
  check('卸货仓容量',d,p.B,'kg');check('装货仓容量',l,p.B,'kg');
  check('A→C 总货物',p.q+d,effective_q,'kg');check('C→B 总货物',p.q+l,effective_q,'kg');
  check('卸货需求',d,p.D,'kg');check('装货需求',l,p.L,'kg');
  if(p.shared_airspace)check('机场共享空域作业窗口许可',z,p.a,'');else skip('机场共享空域作业窗口许可','');
  if(p.enforce_winch===1){
    // 质量预算按较重的那个方向检查：q + max(d,l) + 绞盘硬件 + 仓体/安装件 ≤ 本情景参考净载荷。
    check('绞盘投送上限',d,p.winch_capacity,'kg');check('绞盘收回上限',l,p.winch_capacity,'kg');
    check('索降改装质量预算',p.q+Math.max(d,l)+p.hardware_mass+p.box_mass+p.mount_mass,effective_q,'kg');
  }else{skip('绞盘投送上限','kg');skip('绞盘收回上限','kg');skip('索降改装质量预算','kg');}
  const result={parameters:p,d,l,z,valid:checks.every(c=>c.ok),checks,effective_payload:effective_q,nominal_payload:reference,extrapolated,
    profit:formation.bd*d+formation.bl*l-p.F*z,optimal_profit:operational.value,economic_optimal_profit:optimum.value,
    operation_time:duration,shared_airspace_time:duration*p.shared_airspace,incremental_energy:energy,formation,winch,economics,mode,segments:[],samples:[]};
  result.total_gain_vs_solo_noop=result.profit+p.energy_price*baseline_saving;
  if(!result.valid)return result;
  let clock=0;
  const add=(key,name,minutes,m0,m1,e0,e1,s0,s1)=>{if(minutes<=1e-12)return;result.segments.push({key,name,start:clock,end:clock+minutes,m0,m1,e0,e1,s0,s1});clock+=minutes;};
  const ac=p.distance_ac,e_ac=ad*d,e_c=e_ac+p.e0*z;
  add('ac','A → C · 单机巡航',ac/p.speed*60,p.q+d,p.q+d,0,e_ac,0,ac);
  const arrival=clock;
  if(z&&p.operation_mode===1){
    // 三段计时：接近/转换 → 投送 → 地面换货 → 取货 → 退出。固定耗能在各段之间按时间比例展示。
    const legs=[['approach','C · 接近＋机型转换',p.approach_min+p.transition_min,p.q+d,p.q+d],
      ['drop','C · 投送货物（索降）',wl.tau_drop_per_kg*d,p.q+d,p.q],
      ['exchange','C · 地面换货／重新挂载',p.exchange_fixed_min+p.exchange_per_kg_min*(d+l),p.q,p.q],
      ['pickup','C · 取回货物',wl.tau_pickup_per_kg*l,p.q,p.q+l],
      ['exit','C · 退出作业区',p.exit_min,p.q+l,p.q+l]];
    const total=legs.reduce((s,x)=>s+x[2],0)||1;let acc=0;
    for(const [key,name,minutes,m0,m1] of legs){
      const e1=e_ac+p.e0*z*((acc+minutes)/total),e0v=e_ac+p.e0*z*(acc/total);acc+=minutes;
      add(key,name,minutes,m0,m1,e0v,e1,ac,ac);
    }
  }else if(z){
    add('lower','C · 放下可拆卸仓',p.t0/2,p.q+d,p.q+d,e_ac,e_ac+p.e0/2,ac,ac);
    add('unload','C · 卸下目的地货物',p.td*d,p.q+d,p.q,e_ac+p.e0/2,e_ac+p.e0/2,ac,ac);
    add('load','C · 装入中转货物',p.tl*l,p.q,p.q+l,e_ac+p.e0/2,e_ac+p.e0/2,ac,ac);
    add('raise','C · 收回可拆卸仓',p.t0/2,p.q+l,p.q+l,e_ac+p.e0/2,e_c,ac,ac);
  }
  add('wait','C · 等待编队',Math.max(0,p.W-duration),p.q+l,p.q+l,e_c,e_c,ac,ac);
  add('join','C · 预留入队时间',p.join_buffer,p.q+l,p.q+l,e_c,e_c,ac,ac);
  const departure=clock;
  add('cb',role===0||m===1?'C → B · 单飞巡航':'C → B · 编队巡航',p.distance_cb/p.speed*60,p.q+l,p.q+l,e_c,energy,ac,distance);
  Object.assign(result,{total_time:clock,arrival,departure});
  const sample=t=>{const seg=result.segments.find(s=>t<s.end-1e-10)??result.segments.at(-1),f=clamp((t-seg.start)/(seg.end-seg.start)),v=k=>seg[k+'0']+(seg[k+'1']-seg[k+'0'])*f,progress=clamp((t-departure)/(clock-departure));return {time:t,stage:seg.name,mass:v('m'),energy:v('e'),distance:v('s'),energy_solo:v('e')+(al-formation.al_form)*l*progress,formation_saved:formation.saving*progress};};
  const stamps=[0,clock,...result.segments.flatMap(s=>[s.start,s.end]),...Array.from({length:401},(_,i)=>clock*i/400)];
  result.samples=[...new Set(stamps)].sort((a,b)=>a-b).map(sample);
  return result;
}

export function exportCsv(result){
  if(!result?.valid)throw new Error('不可行方案没有可导出轨迹');
  const rows=[['时间_min','阶段','任务货物_kg','累计新增能耗_kWh','累计航程_km','相同装卸单飞新增能耗_kWh','CB累计编队节能_kWh'],...result.samples.map(s=>[s.time,s.stage,s.mass,s.energy,s.distance,s.energy_solo,s.formation_saved])];
  return '\ufeff'+rows.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');
}

export {REGION_DEFAULTS,REGION_LABELS,TIMING_DEFAULTS,formationRegions,formationTiming} from './experiments.mjs?v=20260929-fifo2';
