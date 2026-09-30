// 索降作业三段计时与「可卸 / 可换 / 盈利」可行域（2026-09-26 接续新增）。
// 公开数据锚点与情景假设严格分开；公式与来源见 docs/winch-model.md。
// 本模块不改变 experiments.mjs 的既有行为，主模型通过 model.mjs 引用同一套推导。
export const WINCH_DEFAULTS = {
  // —— 公开数据锚点（不等于本机实测标定）——
  reference_payload:20,           // 原文 70 km 对应 20 kg 的参考性能点
  winch_capacity:5,               // A2Z RDS2 公开投送/收回上限 kg
  hardware_mass:1.764,            // 绞盘主体带罩 1.5 + 自动释放钩及配重 0.264 kg
  drop_ref_height:20,             // m，公开图表的作业高度
  drop_ref_seconds_per_kg:20.5,   // 41 s ÷ 2 kg
  drop_height_slope:.0175,        // min/(kg·m)，由 (2 kg,20 m)=41 s 与 (2 kg,30 m)=62 s 定出
  pickup_ref_seconds_per_kg:20.5, // 取货无公开数据，默认沿用投送律
  pickup_height_slope:.0175,
  // —— 情景假设（无公开数据支撑）——
  q:10,D:5,L:5,B:5,box_mass:0,mount_mass:0,height:20,
  approach_min:0,transition_min:0,exit_min:0,exchange_fixed_min:0,exchange_per_kg_min:0,
  W:6,H:6,a:1,shared_airspace:1,cd:4,cl:3,F:5,e0:.1,ed:.04,el:.08,G:.65,
  x_axis:'window',y_axis:'height',x_steps:36,y_steps:36,x_max:0,y_max:0,
};
export const WINCH_LABELS = {
  0:'双向作业 · 净收益为正',1:'双向作业 · 净收益非正',2:'仅卸货 · 净收益为正',3:'仅卸货 · 净收益非正',4:'不作业 / 不可行',
};
const AXIS_ORDER = ['window','height','equipment_mass','exchange_per_kg','exchange_fixed','energy','cd','cl','q','demand','winch'];
const AXES = {
  window:{label:'可用作业窗口 W_cap',unit:'min',
    read:p=>p.shared_airspace?Math.min(p.W,p.H):p.W,
    write:(p,v)=>p.shared_airspace?{...p,W:v,H:v}:{...p,W:v}},
  height:{label:'索降作业高度 h',unit:'m',read:p=>p.height,write:(p,v)=>({...p,height:v})},
  equipment_mass:{label:'新增仓体与安装件质量',unit:'kg',read:p=>p.box_mass+p.mount_mass,
    write:(p,v)=>({...p,box_mass:v,mount_mass:0})},
  exchange_per_kg:{label:'地面换货每 kg 时间',unit:'min/kg',read:p=>p.exchange_per_kg_min,
    write:(p,v)=>({...p,exchange_per_kg_min:v})},
  exchange_fixed:{label:'地面换货固定时间',unit:'min',read:p=>p.exchange_fixed_min,
    write:(p,v)=>({...p,exchange_fixed_min:v})},
  energy:{label:'装卸新增可用电量 G',unit:'kWh',read:p=>p.G,write:(p,v)=>({...p,G:v})},
  cd:{label:'卸货每 kg 净贡献 c_d',unit:'单位/kg',read:p=>p.cd,write:(p,v)=>({...p,cd:v})},
  cl:{label:'装货每 kg 净贡献 c_l',unit:'单位/kg',read:p=>p.cl,write:(p,v)=>({...p,cl:v})},
  q:{label:'固定 A→B 货物 q',unit:'kg',read:p=>p.q,write:(p,v)=>({...p,q:v})},
  demand:{label:'两方向需求上限 D = L',unit:'kg',read:p=>Math.min(p.D,p.L),
    write:(p,v)=>({...p,D:v,L:v})},
  winch:{label:'绞盘投送/收回上限',unit:'kg',read:p=>p.winch_capacity,write:(p,v)=>({...p,winch_capacity:v})},
};
const isNum = v => typeof v === 'number' && Number.isFinite(v);

export function winchParameters(input = {}) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new Error('参数必须是对象');
  for (const k of Object.keys(input)) if (!(k in WINCH_DEFAULTS)) throw new Error('未知参数：' + k);
  const p = {...WINCH_DEFAULTS,...input};
  for (const k of Object.keys(WINCH_DEFAULTS)) {
    if (k === 'x_axis' || k === 'y_axis') continue;
    if (!isNum(p[k]) || p[k] < 0 || p[k] > 10000) throw new Error(k + ' 必须为 0–10000 的有限数值');
  }
  for (const k of ['x_axis','y_axis']) if (!AXIS_ORDER.includes(p[k])) throw new Error(k + ' 必须是可选扫描轴之一');
  if (p.x_axis === p.y_axis) throw new Error('横纵轴不能是同一条扫描轴');
  for (const k of ['x_steps','y_steps']) if (!Number.isInteger(p[k]) || p[k] < 4 || p[k] > 120) throw new Error('扫描格数须为 4–120 的整数');
  for (const k of ['shared_airspace','a']) if (![0,1].includes(p[k])) throw new Error(k + ' 须为 0 或 1');
  if (p.reference_payload <= 0) throw new Error('参考性能点必须大于零');
  if (p.q > p.reference_payload) throw new Error('固定货物已超过参考性能点');
  if (p.drop_ref_height < 0 || p.drop_height_slope < 0 || p.pickup_height_slope < 0) throw new Error('高度参数不能为负');
  return p;
}

// τ(h) = slope·h + intercept，两点定出；intercept 可能为负，说明真实关系必含正的固定项。
// 因此低高度处线性外推会给出负值，这里把它夹到 0 并记录，避免出现「抬得越低反而越快」的假象。
function heightLaw(slopePerKg, refSecondsPerKg, refHeight) {
  const intercept = refSecondsPerKg / 60 - slopePerKg * refHeight;
  const raw = h => intercept + slopePerKg * h;
  return { interceptMin: intercept, raw, at: h => Math.max(0, raw(h)), clampedAt: h => raw(h) < 0 };
}
const fin = v => Number.isFinite(v) ? v : null;
// 接受部分参数：内部工具与界面都可能只给出被改动的那几项。
export function winchDerived(input = {}) {
  const p = {...WINCH_DEFAULTS,...input};
  const drop = heightLaw(p.drop_height_slope,p.drop_ref_seconds_per_kg,p.drop_ref_height);
  const pickup = heightLaw(p.pickup_height_slope,p.pickup_ref_seconds_per_kg,p.drop_ref_height);
  const tauDrop = drop.at(p.height), tauPickup = pickup.at(p.height);
  const tFixed = p.approach_min + p.transition_min + p.exit_min + p.exchange_fixed_min;
  const massBudget = p.reference_payload - p.q - p.hardware_mass - p.box_mass - p.mount_mass;
  const capMass = Math.max(0,massBudget);
  const capDrop = Math.max(0,Math.min(p.winch_capacity,p.D,p.B,capMass));
  const capLoad = Math.max(0,Math.min(p.winch_capacity,p.L,p.B,capMass));
  const windowCap = p.shared_airspace ? Math.min(p.W,p.H) : p.W;
  return {
    tau_drop_per_kg:tauDrop, tau_pickup_per_kg:tauPickup,
    tau_clamped:drop.clampedAt(p.height) || pickup.clampedAt(p.height),
    // 高度律的等效直线系数，便于论文直接引用；截距为负说明真实关系必含正的固定项
    drop_intercept_min_per_kg:drop.interceptMin, drop_slope_min_per_kg_m:p.drop_height_slope,
    pickup_intercept_min_per_kg:pickup.interceptMin, pickup_slope_min_per_kg_m:p.pickup_height_slope,
    reference_height:p.drop_ref_height,
    t_fixed_min:tFixed, mass_budget:massBudget, cap_d:capDrop, cap_l:capLoad,
    window_cap:windowCap, window_free:windowCap - tFixed, energy_free:p.G - p.e0,
    time_per_kg_d:tauDrop + p.exchange_per_kg_min, time_per_kg_l:tauPickup + p.exchange_per_kg_min,
    height_coeff_min_per_kg:(p.drop_height_slope + p.pickup_height_slope),
  };
}

// 固定 z=1 的二维可行域顶点枚举；返回 null 表示 z=1 不可行。
function bestActive(p,d) {
  const rows = [[-1,0,0],[0,-1,0],[1,0,d.cap_d],[0,1,d.cap_l],
    [d.time_per_kg_d,d.time_per_kg_l,d.window_free],[p.ed,p.el,d.energy_free]];
  if (d.cap_d <= 0 && d.cap_l <= 0) return null;
  let best = null;
  const consider = (x,y) => {
    if (!(x >= -1e-12 && y >= -1e-12)) return;
    if (!rows.every(([a,b,c]) => a*x + b*y <= c + 1e-9)) return;
    if (x + y <= 1e-12) return;
    const value = p.cd*x + p.cl*y;
    if (!best || value > best.value + 1e-12) best = {d:x,l:y,value,time:0,energy:0};
  };
  for (let i = 0; i < rows.length; i++) for (let j = i+1; j < rows.length; j++) {
    const [a,b,c] = rows[i], [u,v,w] = rows[j], det = a*v - b*u;
    if (Math.abs(det) < 1e-15) continue;
    consider((c*v - b*w)/det,(a*w - c*u)/det);
  }
  consider(d.cap_d,0); consider(0,d.cap_l); consider(d.cap_d,d.cap_l);
  if (!best) return null;
  best.time = d.time_per_kg_d*best.d + d.time_per_kg_l*best.l;
  best.energy = p.ed*best.d + p.el*best.l;
  best.profit = best.value - p.F;
  return best;
}
function maxDrop(p,d) {
  const lim = [d.cap_d];
  if (d.time_per_kg_d > 1e-15) lim.push(d.window_free / d.time_per_kg_d);
  if (p.ed > 1e-15) lim.push(d.energy_free / p.ed);
  return Math.max(0,Math.min(...lim));
}
function maxLoad(p,d) {
  const lim = [d.cap_l];
  if (d.time_per_kg_l > 1e-15) lim.push(d.window_free / d.time_per_kg_l);
  if (p.el > 1e-15) lim.push(d.energy_free / p.el);
  return Math.max(0,Math.min(...lim));
}
export function winchPoint(p,d) {
  const active = bestActive(p,d);
  const idle = active === null || active.profit <= 1e-12;
  const chosen = idle ? {d:0,l:0,value:0,profit:0,time:0,energy:0} : active;
  const both = !idle && chosen.l > 1e-12;
  const cls = idle ? 4 : both ? (chosen.profit > 0 ? 0 : 1) : (chosen.profit > 0 ? 2 : 3);
  const exchangeCap = Math.min(d.cap_d,d.cap_l,
    d.time_per_kg_d + d.time_per_kg_l > 1e-15 ? d.window_free/(d.time_per_kg_d + d.time_per_kg_l) : Infinity,
    p.ed + p.el > 1e-15 ? d.energy_free/(p.ed + p.el) : Infinity);
  return {
    cls:cls, label:WINCH_LABELS[cls],
    optimum:{d:chosen.d,l:chosen.l,profit:chosen.profit,time_min:chosen.time,energy_kwh:chosen.energy,z:idle?0:1},
    best_active:active,
    unload_feasible:maxDrop(p,d) > 1e-12, load_feasible:maxLoad(p,d) > 1e-12,
    exchange_feasible:Math.max(0,exchangeCap) > 1e-12,
    exchange_capacity:fin(Math.max(0,exchangeCap)),
    max_d:fin(maxDrop(p,d)), max_l:fin(maxLoad(p,d)),
    window_free:d.window_free, energy_free:d.energy_free,
    caps:{d:d.cap_d,l:d.cap_l}, mass_budget:d.mass_budget,
    tau_clamped:d.tau_clamped,
  };
}

// 沿一条单调轴做边界搜索，返回 {value,status}；status 说明该阈值是否落在搜索区间内。
function scanDown(f,lo,hi,steps=80) {          // 求「仍然为真」的最大点
  if (!f(lo)) return {value:null,status:'lower_already_false'};
  if (f(hi)) return {value:hi,status:'beyond_upper'};
  let a = lo, b = hi;
  for (let i = 0; i < steps; i++) { const m = (a + b) / 2; if (f(m)) a = m; else b = m; }
  return {value:a,status:'found'};
}
function scanUp(f,lo,hi,steps=80) {            // 求「首次为真」的最小点
  if (f(lo)) return {value:lo,status:'lower_already_true'};
  if (!f(hi)) return {value:null,status:'beyond_upper'};
  let a = lo, b = hi;
  for (let i = 0; i < steps; i++) { const m = (a + b) / 2; if (f(m)) b = m; else a = m; }
  return {value:b,status:'found'};
}
function axisUpper(key,p,d) {
  const full = d.time_per_kg_d*d.cap_d + d.time_per_kg_l*d.cap_l;
  switch (key) {
    case 'window': return Math.max(2*(d.t_fixed_min + full), 2*d.window_cap, 1);
    case 'height': return 60;
    case 'equipment_mass': return Math.max(1, d.mass_budget + Math.max(p.box_mass + p.mount_mass,0) + 2);
    case 'exchange_per_kg': return Math.max(.4, 2*p.exchange_per_kg_min);
    case 'exchange_fixed': return Math.max(4, 2*d.t_fixed_min + full);
    case 'energy': return Math.max(1, 3*p.G);
    case 'cd': return Math.max(6, 3*p.cd);
    case 'cl': return Math.max(6, 3*p.cl);
    case 'q': return Math.max(1, p.reference_payload);
    case 'demand': return Math.max(4, 2*Math.max(p.D,p.L));
    case 'winch': return Math.max(4, 2*p.winch_capacity);
    default: throw new Error('未知扫描轴');
  }
}
function thresholds(p,d) {
  const at = (key,value) => winchDerived(AXES[key].write(p,value));
  const fullEnergy = p.ed*d.cap_d + p.el*d.cap_l;
  const up = key => axisUpper(key,p,d);
  const feasibleAt = params => { const dd = winchDerived(params); return bestActive(params,dd) !== null; };
  const profitableAt = params => { const dd = winchDerived(params); const a = bestActive(params,dd); return !!a && a.profit > 0; };
  const runnableAt = key => v => feasibleAt(AXES[key].write(p,v));
  const profAt = key => v => profitableAt(AXES[key].write(p,v));
  // 满额作业：d = cap_d 且 l = cap_l 同时可行
  const fullAt = params => {
    const dd = winchDerived(params);
    if (!(dd.cap_d > 0 && dd.cap_l > 0)) return false;
    return dd.time_per_kg_d*dd.cap_d + dd.time_per_kg_l*dd.cap_l <= dd.window_free + 1e-9
        && params.ed*dd.cap_d + params.el*dd.cap_l <= dd.energy_free + 1e-9;
  };
  // 满额作业是哪一个资源先卡住
  let limitedBy = null;
  if (d.cap_d <= 0 || d.cap_l <= 0) limitedBy = '绞盘 / 货仓 / 质量预算';
  else if (p.ed*d.cap_d + p.el*d.cap_l > d.energy_free + 1e-9) limitedBy = '装卸新增电量预算 G';
  else if (d.time_per_kg_d*d.cap_d + d.time_per_kg_l*d.cap_l > d.window_free + 1e-9) limitedBy = '可用作业窗口';
  return {
    fixed_stage_total_min:d.t_fixed_min,
    window_min_active:{value:d.t_fixed_min,status:'found'},
    window_full_capability:scanUp(v => fullAt(AXES.window.write(p,v)),0,up('window')),
    window_break_even:scanUp(profAt('window'),0,up('window')),
    height_full_capability:scanDown(v => fullAt(AXES.height.write(p,v)),0,400),
    height_break_even:scanDown(profAt('height'),0,400),
    equipment_mass_max:scanDown(v => winchDerived(AXES.equipment_mass.write(p,v)).cap_d > 0,0,up('equipment_mass')),
    exchange_per_kg_max:scanDown(runnableAt('exchange_per_kg'),0,4),
    exchange_fixed_max:scanDown(runnableAt('exchange_fixed'),0,up('exchange_fixed')),
    height_max_runnable:scanDown(runnableAt('height'),0,400),
    energy_min_active:{value:p.e0,status:'found'},
    energy_full_capability:{value:p.e0 + fullEnergy,status:'found'},
    energy_break_even:scanUp(profAt('energy'),0,up('energy')),
    demand_max_runnable:scanDown(runnableAt('demand'),0,up('demand')),
    q_max_runnable:scanDown(runnableAt('q'),0,up('q')),
    // 「满额」口径：能不能把绞盘/货仓允许的量全部做完。只判「能不能做一点点」几乎恒真，
    // 因此操作上真正有意义的阈值是下面这一组。
    exchange_per_kg_full_capability:scanDown(v => fullAt(AXES.exchange_per_kg.write(p,v)),0,4),
    exchange_fixed_full_capability:scanDown(v => fullAt(AXES.exchange_fixed.write(p,v)),0,up('exchange_fixed')),
    equipment_mass_full_capability:scanDown(v => fullAt(AXES.equipment_mass.write(p,v)),0,up('equipment_mass')),
    demand_full_capability:scanDown(v => fullAt(AXES.demand.write(p,v)),0,up('demand')),
    q_full_capability:scanDown(v => fullAt(AXES.q.write(p,v)),0,up('q')),
    caps:{d:d.cap_d,l:d.cap_l}, full_time_min:d.time_per_kg_d*d.cap_d + d.time_per_kg_l*d.cap_l,
    full_energy_kwh:fullEnergy, full_capability_limited_by:limitedBy,
    harness_note:'窗口阈值只说明所列离散模型可行，不证明空域、电量与机械接口在实际任务中可用。status 为 beyond_upper 表示真实阈值在搜索区间之外。',
    cap_positive:d.cap_d > 0 && d.cap_l > 0,
  };
}

export function winchStudy(input = {}) {
  const p = winchParameters(input ?? {});
  const d = winchDerived(p);
  const xKey = p.x_axis, yKey = p.y_axis;
  const xMax = p.x_max > 0 ? p.x_max : axisUpper(xKey,p,d);
  const yMax = p.y_max > 0 ? p.y_max : axisUpper(yKey,p,d);
  const values = (key,max,steps) => Array.from({length:steps+1},(_,i)=>max*i/steps);
  const xs = values(xKey,xMax,p.x_steps), ys = values(yKey,yMax,p.y_steps);
  const grid = [], detail = [];
  for (const y of ys) {
    const rowBase = AXES[yKey].write(p,y);
    const row = [], rowDetail = [];
    for (const x of xs) {
      const params = AXES[xKey].write(rowBase,x);
      const dd = winchDerived(params);
      const point = winchPoint(params,dd);
      row.push(point.cls);
      rowDetail.push({cls:point.cls,d:point.optimum.d,l:point.optimum.l,profit:point.optimum.profit,
        exchange:point.exchange_feasible,unload:point.unload_feasible,cap_d:dd.cap_d,cap_l:dd.cap_l,
        full:dd.cap_d > 0 && dd.cap_l > 0
          && dd.time_per_kg_d*dd.cap_d + dd.time_per_kg_l*dd.cap_l <= dd.window_free + 1e-9
          && params.ed*dd.cap_d + params.el*dd.cap_l <= dd.energy_free + 1e-9});
    }
    grid.push(row); detail.push(rowDetail);
  }
  const counts = Object.fromEntries(Object.values(WINCH_LABELS).map(s=>[s,0]));
  let exchangeCount = 0, unloadCount = 0, profitableCount = 0, fullCount = 0;
  detail.forEach(row=>row.forEach(cell=>{counts[WINCH_LABELS[cell.cls]]++;
    if (cell.unload) unloadCount++; if (cell.exchange) exchangeCount++;
    if (cell.full) fullCount++;
    if (cell.profit > 1e-12) profitableCount++;}));
  const total = xs.length*ys.length;
  const here = winchPoint(p,d);
  return {
    parameters:p, derived:d, labels:WINCH_LABELS,
    axes:{
      x:{key:xKey,label:AXES[xKey].label,unit:AXES[xKey].unit,values:xs,max:xMax},
      y:{key:yKey,label:AXES[yKey].label,unit:AXES[yKey].unit,values:ys,max:yMax},
    },
    grid, detail, point:here, thresholds:thresholds(p,d),
    summary:{counts,total,shares:Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,v/total])),
      unload_share:unloadCount/total, exchange_share:exchangeCount/total, profitable_share:profitableCount/total,
      full_capability_share:fullCount/total,
      cell_x:xMax/p.x_steps, cell_y:yMax/p.y_steps,
      t_fixed_min:d.t_fixed_min, cap_d:d.cap_d, cap_l:d.cap_l, mass_budget:d.mass_budget,
      tau_drop_per_kg_min:d.tau_drop_per_kg, tau_pickup_per_kg_min:d.tau_pickup_per_kg,
      height_intercept_min_per_kg:d.drop_intercept_min_per_kg,
      note:'分区按所列离散模型逐格判定；比例是绘图范围内的采样占比，不是实际需求概率。任意小量的 d>0 几乎总是可行，所以「可卸/可换」占比会远大于「满额作业」占比；请以满额阈值与 cap_d/cap_l 为准。'},
  };
}

export function winchPointAt(input = {}) {
  const p = winchParameters(input ?? {});
  const d = winchDerived(p);
  return {parameters:p,derived:d,point:winchPoint(p,d),thresholds:thresholds(p,d)};
}
export { AXIS_ORDER as WINCH_AXIS_ORDER };
