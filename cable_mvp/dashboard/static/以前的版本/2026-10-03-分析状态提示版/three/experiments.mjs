// Scenario models; two-point energy interpolation is NOT the paper's range curve.
export const REGION_DEFAULTS={formation_size:3,formation_role:1,eta:.1,propulsion_share:.6,
  k0:.025,energy_price:1,time_value:.015,delay:6.5,coordination_cost:0,
  distance_max:140,payload_max:35,distance_steps:140,payload_steps:70,speed:108,loiter:1,
  allow_extrapolation:0,payload_limit:20};
export const REGION_LABELS={0:'均可达 · 单飞不贵',1:'均可达 · 编队更省',2:'仅编队可达（情景）',3:'两者不可达 / 超出范围',4:'仅单飞可达（等待耗电）'};
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
function parameters(defaults,input,except=[]){
  if(!object(input))throw new Error('参数必须是对象');
  for(const k of Object.keys(input))if(!(k in defaults)&&!except.includes(k))throw new Error('未知参数：'+k);
  const p={...defaults,...input};
  for(const k of Object.keys(defaults))if(k!=='demand'&&(typeof p[k]!=='number'||!Number.isFinite(p[k])||p[k]<0||p[k]>10000))throw new Error(k+' 必须为 0–10000 的有限数值');
  return p;
}
export function regionPoint(p,d,D,q){
  const rate=p.k0+d.k1*q,within=q>=0&&q<=p.payload_limit&&D>=0&&(p.allow_extrapolation||D<=110);
  const solo=!!within&&rate*D<=d.e_max+1e-9;
  const formation=!!within&&d.gamma*rate*D+d.wait_energy<=d.e_max+1e-9;
  const advantage=p.energy_price*((1-d.gamma)*rate*D-d.wait_energy)-p.time_value*q*p.delay-p.coordination_cost;
  const region=!solo&&!formation?3:!solo?2:!formation?4:advantage>1e-9?1:0;
  const cap=p.allow_extrapolation?Infinity:110;
  const valid=q>=0&&q<=p.payload_limit;
  const denominator=p.energy_price*(1-d.gamma)*rate;
  return {distance:D,payload:q,region,solo_feasible:solo,formation_feasible:formation,advantage,
    solo_distance:valid?Math.min(cap,d.e_max/rate):null,
    formation_distance:valid&&d.e_max>=d.wait_energy?Math.min(cap,(d.e_max-d.wait_energy)/(d.gamma*rate)):null,
    break_even:valid&&denominator>0?(p.time_value*q*p.delay+p.energy_price*d.wait_energy+p.coordination_cost)/denominator:null,
    extrapolated:D>110};
}
export function formationRegions(input={}){
  const p=parameters(REGION_DEFAULTS,input,['marker']);
  if(!Number.isInteger(p.formation_size)||p.formation_size<1||p.formation_size>8||![0,1,2,3].includes(p.formation_role))throw new Error('编队规模须为 1–8 整数，角色须为 0–3');
  if(p.eta>1||p.propulsion_share>1)throw new Error('η、χ 须在 0–1');
  if(![0,1].includes(p.loiter)||![0,1].includes(p.allow_extrapolation))throw new Error('开关须为 0 或 1');
  if(![p.k0,p.speed,p.distance_max,p.payload_max].every(v=>v>0))throw new Error('能耗系数、速度和绘图范围必须大于零');
  if(!Number.isInteger(p.distance_steps)||p.distance_steps<1||p.distance_steps>600||!Number.isInteger(p.payload_steps)||p.payload_steps<1||p.payload_steps>300)throw new Error('网格数量超出支持范围');
  const m=p.formation_size,a=p.formation_role===1?(m-1)/m:p.formation_role===2?((m-1)/m)**2:0;
  const derived={gamma:1-p.propulsion_share*p.eta*a,drag_reduction:p.eta*a,k1:2*p.k0/15,
    e_max:(p.k0+2*p.k0/15*20)*70,solo_range_max:110,loiter_rate:p.k0*p.speed/60};
  derived.wait_energy=p.loiter?derived.loiter_rate*p.delay:0;
  const distances=Array.from({length:p.distance_steps+1},(_,i)=>p.distance_max*i/p.distance_steps);
  const payloads=Array.from({length:p.payload_steps+1},(_,i)=>p.payload_max*i/p.payload_steps);
  const grid=payloads.map(q=>distances.map(D=>regionPoint(p,derived,D,q).region));
  const boundary=payloads.map(q=>regionPoint(p,derived,0,q));
  const counts=Object.fromEntries(Object.values(REGION_LABELS).map(s=>[s,0]));let extrapolated=0;
  grid.forEach((row,i)=>row.forEach((cell,j)=>{counts[REGION_LABELS[cell]]++;if(p.allow_extrapolation&&distances[j]>110&&[0,1,2,4].includes(cell))extrapolated++;}));
  const total=distances.length*payloads.length;
  let marker=null;
  if(input.marker&&Number.isFinite(input.marker.distance)&&Number.isFinite(input.marker.payload))marker=regionPoint(p,derived,input.marker.distance,input.marker.payload);
  return {parameters:p,derived,distances,payloads,grid,region_labels:REGION_LABELS,marker,
    solo_boundary:boundary.map(x=>x.solo_distance),formation_boundary:boundary.map(x=>x.formation_distance),break_even:boundary.map(x=>x.break_even),
    summary:{counts,total,shares:Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,v/total])),chi_eta:p.eta*p.propulsion_share,
      extrapolated_beyond_110km:extrapolated,extrapolated_share:extrapolated/total,cell_width_km:p.distance_max/p.distance_steps,cell_height_kg:p.payload_max/p.payload_steps}};
}

export const TIMING_DEFAULTS={distance:70,payload:10,speed:108,k0:.025,slice_minutes:60,
  demand:[3,5,8,10,9,6,4],formation_cap:8,gamma:.96,delta:.5,D:3,capacity_per_slice:40,
  time_value:.015,energy_price:1,loiter:1,coordination_cost:0,allow_wait:1,
  // 逐机资源约束（2026-09-26 新增）：0 一律表示「本情景不施加该约束」。
  battery_kwh:0,max_airborne_min:0,max_wait_slices:0,service_per_slice:0};

// χ·η 灵敏度：2026-09-26 的文献页码级核查（research/aero_sources_verified_2026-09-26.md）
// 推翻了原先「χη ∈ [0.10, 0.18]」的标定区间——那些数字几乎都是二次引用的军机/运输机燃油数据，
// 没有一条是 96 kg 级电动垂起固定翼的一手值。这里把 χη 当作可扫描的情景参数，
// 用来回答「结论在哪个区间内还站得住」，而不是把某一个数当成标定值。
export const CHI_ETA_DEFAULT_SWEEP=[.02,.04,.06,.08,.10,.12,.15,.18];
export function chiEtaSensitivity(input={}){
  const p=parameters(REGION_DEFAULTS,input,['marker','chi_eta_values','ref_payload']);
  const values=Array.isArray(input.chi_eta_values)?input.chi_eta_values:CHI_ETA_DEFAULT_SWEEP;
  if(!values.length||values.length>40||values.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>1))
    throw new Error('χη 扫描值须为 0–1 的有限数值，且不超过 40 个');
  if(!(p.propulsion_share>0))throw new Error('χ 必须大于零，否则无法由 χη 反解 η');
  const q=typeof input.ref_payload==='number'&&Number.isFinite(input.ref_payload)?input.ref_payload:p.payload_limit;
  if(q<0||q>p.payload_max)throw new Error('参考载重超出绘图范围');
  const m=p.formation_size,role=p.formation_role;
  const a=role===1?(m-1)/m:role===2?((m-1)/m)**2:0;
  const rows=values.map(chiEta=>{
    const eta=chiEta/p.propulsion_share;
    const gamma=1-chiEta*a;
    const k1=2*p.k0/15,eMax=(p.k0+k1*20)*70,rate=p.k0+k1*q;
    const wait=p.loiter?(p.k0*p.speed/60)*p.delay:0;
    const cap=p.allow_extrapolation?Infinity:110;
    const soloDistance=Math.min(cap,eMax/rate);
    const formationDistance=eMax>=wait?Math.min(cap,(eMax-wait)/(gamma*rate)):null;
    const denominator=p.energy_price*(1-gamma)*rate;
    const breakEven=denominator>0?(p.time_value*q*p.delay+p.energy_price*wait+p.coordination_cost)/denominator:null;
    const advantageAtSolo=p.energy_price*((1-gamma)*rate*soloDistance-wait)-p.time_value*q*p.delay-p.coordination_cost;
    return {chi_eta:chiEta,eta,gamma,follower_saving:1-gamma,propulsion_share:p.propulsion_share,
      solo_distance:soloDistance,formation_distance:formationDistance,
      range_gain_km:formationDistance===null?null:formationDistance-soloDistance,
      break_even_km:breakEven,advantage_at_solo_limit:advantageAtSolo,
      formation_cheaper_at_solo_limit:advantageAtSolo>1e-9,
      formation_reaches_further:formationDistance!==null&&formationDistance>soloDistance+1e-12};
  });
  const baseDerived={gamma:1-p.propulsion_share*p.eta*a,drag_reduction:p.eta*a,k1:2*p.k0/15,
    e_max:(p.k0+2*p.k0/15*20)*70,solo_range_max:110,loiter_rate:p.k0*p.speed/60};
  baseDerived.wait_energy=p.loiter?baseDerived.loiter_rate*p.delay:0;
  const current=p.eta*p.propulsion_share;
  const byChiEta=chiEta=>rows.find(r=>Math.abs(r.chi_eta-chiEta)<1e-12)||null;
  const maxCheaper=rows.filter(r=>r.formation_cheaper_at_solo_limit).reduce((x,r)=>Math.max(x,r.chi_eta),-Infinity);
  const maxFurther=rows.filter(r=>r.formation_reaches_further).reduce((x,r)=>Math.max(x,r.chi_eta),-Infinity);
  return {parameters:p,derived:baseDerived,reference_payload:q,rows,
    current_chi_eta:current,current:byChiEta(current),
    summary:{sweep:values,max_chi_eta_still_cheaper:Number.isFinite(maxCheaper)?maxCheaper:null,
      max_chi_eta_reaching_further:Number.isFinite(maxFurther)?maxFurther:null,
      cheaper_in_sweep:Number.isFinite(maxCheaper),further_in_sweep:Number.isFinite(maxFurther),
      default_chi_eta:current,
      note:'χη 是情景参数而不是本机标定值。核查结论：现有文献包内没有同量级同口径的一手全机节能值，'+
        '按「诱导阻力占总阻力约 45%（二手）× 巡航占全机能量约 60%（情景）」折算，乐观上界约 8%，'+
        '故默认取 χη=0.06。range_gain_km 与 advantage_at_solo_limit 都只在两点能量拟合与所列假设下成立。'+
        '若 cheaper_in_sweep 为 false，说明在参考载重与给定等待时长下，整个扫描区间内编队都不比单飞便宜——'+
        '这才是本模型的结论，不要把它当成程序错误。'}};
}
export function formationTiming(input={}){
  const p=parameters(TIMING_DEFAULTS,input);
  if(![p.speed,p.k0,p.slice_minutes,p.distance].every(v=>v>0))throw new Error('速度、能耗系数、片长和航程必须大于零');
  if(!Number.isInteger(p.formation_cap)||p.formation_cap<1||p.formation_cap>8)throw new Error('最大编队须为 1–8 整数');
  if(!(p.gamma>0&&p.gamma<=1&&p.delta>0&&p.delta<=p.D))throw new Error('γ 须在 (0,1]，δ 须在 (0,D]');
  if(![0,1].includes(p.loiter)||![0,1].includes(p.allow_wait))throw new Error('开关须为 0 或 1');
  for(const k of ['max_wait_slices','service_per_slice'])
    if(!Number.isInteger(p[k])||p[k]<0||p[k]>10000)throw new Error(k+' 须为 0–10000 的整数（0 表示不约束）');
  if(p.max_wait_slices>48)throw new Error('累计等待上限不能超过 48 片（本原型的时域上限）');
  if(p.battery_kwh<0||p.max_airborne_min<0)throw new Error('电池容量与空中时长上限不能为负');
  if(!Array.isArray(p.demand)||!p.demand.length||p.demand.length>48||p.demand.some(n=>!Number.isInteger(n)||n<0))throw new Error('需求须为 1–48 个非负整数');
  const N=p.demand.reduce((a,b)=>a+b,0),T=p.demand.length;
  if(N>240)throw new Error('交互原型支持总计至多 240 架次；请缩短时域或缩小需求');
  const k1=2*p.k0/15,eSolo=(p.k0+k1*p.payload)*p.distance,eFollower=p.gamma*eSolo;
  const loiterRate=p.k0*p.speed/60,waitEnergy=p.loiter?loiterRate*p.slice_minutes:0;
  const holdCost=p.time_value*p.payload*p.slice_minutes+p.energy_price*waitEnergy;
  // For n departures and g groups, occupancy = n*delta + g*(D-delta).
  // Knapsack gives the cheapest grouping; no exponential partition enumeration.
  function launches(cap){
    const table=Array.from({length:N+1},()=>new Map());table[0].set(0,{cost:0,parts:[]});
    for(let n=1;n<=N;n++)for(let size=1;size<=Math.min(cap,n);size++){
      const cost=p.energy_price*(eSolo+(size-1)*eFollower)+(size>1?p.coordination_cost:0);
      for(const [groups,prev] of table[n-size]){
        const g=groups+1;if(n*p.delta+g*(p.D-p.delta)>p.capacity_per_slice+1e-9)continue;
        const old=table[n].get(g),value=prev.cost+cost;
        if(!old||value<old.cost-1e-12)table[n].set(g,{cost:value,parts:[...prev.parts,size]});
      }
    }
    return table.map(row=>[...row.values()].reduce((a,b)=>!a||b.cost<a.cost-1e-12?b:a,null));
  }
  const soloLaunch=launches(1),formLaunch=launches(p.formation_cap);

  // —— 逐机资源：电池、累计空中等待时长、机场服务率 ——
  // 「每架最多等 W 片」在 FIFO 下等价于一条纯聚合约束 carried_t ≤ 最近 W 片的到达数之和，
  // 因而不需要把「机龄」放进动态规划的状态，状态空间与原来同一量级。
  const flightMinutes=p.distance/p.speed*60;
  const cruiseWorstCase=eSolo;                       // 领航不打折，是队内能耗上界
  const batteryCap=p.battery_kwh>0
    ?(waitEnergy>1e-15?Math.floor((p.battery_kwh-cruiseWorstCase)/waitEnergy+1e-12):Infinity)
    :Infinity;
  const airborneCap=p.max_airborne_min>0
    ?Math.floor((p.max_airborne_min-flightMinutes)/p.slice_minutes+1e-12)
    :Infinity;
  const userWaitCap=p.max_wait_slices>0?p.max_wait_slices:Infinity;
  const waitCapSlices=Math.min(batteryCap,airborneCap,userWaitCap);
  const serviceCap=p.service_per_slice>0?p.service_per_slice:Infinity;
  const prefix=[];let running=0;
  for(const n of p.demand){running+=n;prefix.push(running);}
  const windowArrivals=(t,W)=>W===Infinity?Infinity:W<=0?0:prefix[t]-(t-W>=0?prefix[t-W]:0);
  const blockers=[];
  if(batteryCap<0)blockers.push(`电池 ${p.battery_kwh} kWh 不足以完成一次含等待的 ${p.distance} km 架次（单机巡航需 ${cruiseWorstCase.toFixed(3)} kWh）`);
  if(p.max_airborne_min>0&&airborneCap<0)blockers.push(`累计空中时长上限 ${p.max_airborne_min} min 小于单程飞行时间 ${flightMinutes.toFixed(1)} min`);
  if(serviceCap===0&&N>0)blockers.push('每片服务能力为 0，无法起飞任何架次');

  function solve(launch,priced,caps=true){
    if(blockers.length)return {status:'resource_infeasible',cost:null,wait_sortie_slices:null,rows:[],blockers};
    const useWaitCap=caps?waitCapSlices:Infinity,useService=caps?serviceCap:Infinity;
    let states=new Map([[0,{cost:0,waitUnits:0,rows:[]}]]);
    for(let t=0;t<T;t++){
      const next=new Map();
      const cap=windowArrivals(t,useWaitCap);
      for(const [carried,prev] of states){
        const total=carried+p.demand[t];
        const maxFlies=Math.min(total,useService===Infinity?total:useService);
        for(let flies=maxFlies;flies>=0;flies--){
          const held=total-flies;if(held&&(!p.allow_wait||t===T-1))continue;
          if(held>cap+1e-9)continue;                    // 逐机等待上限：聚合等价形式
          const choice=launch[flies];if(!choice)continue;
          const value=prev.cost+choice.cost+(priced?held*holdCost:0),waitUnits=prev.waitUnits+held;
          const old=next.get(held);
          if(old&&(value>old.cost-1e-12&&!(Math.abs(value-old.cost)<=1e-12&&waitUnits<old.waitUnits)))continue;
          const parts=choice.parts,energy=parts.reduce((s,m)=>s+eSolo+(m-1)*eFollower,0);
          const row={slice:t+1,ready:p.demand[t],carried,departed:flies,held,parts,solo:parts.filter(m=>m===1).length,
            occupancy:parts.reduce((s,m)=>s+p.D+(m-1)*p.delta,0),cruise_energy:energy,
            wait_energy:held*waitEnergy,time_cost:held*p.time_value*p.payload*p.slice_minutes,
            charged_wait_cost:priced?held*holdCost:0,departure_cost:choice.cost,
            wait_cap_slices:useWaitCap===Infinity?null:useWaitCap,
            wait_cap_count:cap===Infinity?null:cap,
            service_cap:useService===Infinity?null:useService,
            capped_by_wait:useWaitCap!==Infinity&&held>0&&held>=cap-1e-9,
            capped_by_service:useService!==Infinity&&flies>=useService&&total>flies};
          next.set(held,{cost:value,waitUnits,rows:[...prev.rows,row]});
        }
      }
      states=next;
    }
    const result=states.get(0);
    return result?{status:'optimal',cost:result.cost,wait_sortie_slices:result.waitUnits,rows:result.rows}:
      {status:'infeasible',cost:null,wait_sortie_slices:null,rows:[]};
  }

  // 把聚合方案还原成逐机 FIFO 队列，独立核验「最长等待 ≤ W」并给出实际最长等待。
  function fifoMaxWait(rows){
    const queue=[];let maxWait=0;
    for(const row of rows){
      for(let i=0;i<row.ready;i++)queue.push(row.slice-1);
      for(let i=0;i<row.departed;i++){
        const arrival=queue.shift();
        if(arrival===undefined)return {max_wait_slices:null,error:'FIFO 队列为空却仍在起飞'};
        maxWait=Math.max(maxWait,row.slice-1-arrival);
      }
    }
    return {max_wait_slices:maxWait,remaining:queue.length};
  }

  const scenarios={solo_only:solve(soloLaunch,true),formation_free_wait:solve(formLaunch,false),formation_with_wait:solve(formLaunch,true)};
  const costs=Object.fromEntries(Object.entries(scenarios).map(([k,v])=>[k,v.cost]));
  const saving=(a,b)=>a===null||b===null?null:a-b;
  const ideal=saving(costs.solo_only,costs.formation_free_wait),timed=saving(costs.solo_only,costs.formation_with_wait);
  const rows=scenarios.formation_with_wait.rows,formations=rows.map(r=>r.parts.filter(m=>m>1));
  const formed=formations.flat().reduce((a,b)=>a+b,0);
  const fifo=fifoMaxWait(rows);
  const active=[];
  if(waitCapSlices!==Infinity)active.push(batteryCap===waitCapSlices?'电池':airborneCap===waitCapSlices?'空中时长':'累计等待上限');
  if(serviceCap!==Infinity)active.push('机场服务率');
  // 这些约束到底有没有改变最优方案？再解一次不带任何逐机资源上限的同一问题作对照。
  const capsActive=waitCapSlices!==Infinity||serviceCap!==Infinity;
  let effect=null;
  if(capsActive&&!blockers.length){
    const free=solve(formLaunch,true,false);
    effect={cost_without_resource_caps:free.cost,cost_with_resource_caps:costs.formation_with_wait,
      wait_sortie_slices_without:free.wait_sortie_slices,wait_sortie_slices_with:scenarios.formation_with_wait.wait_sortie_slices,
      changes_optimum:free.cost!==null&&costs.formation_with_wait!==null&&Math.abs(free.cost-costs.formation_with_wait)>1e-9,
      makes_infeasible:free.cost!==null&&costs.formation_with_wait===null,
      binding:free.cost===null||costs.formation_with_wait===null||Math.abs(free.cost-costs.formation_with_wait)>1e-9};
  }
  return {parameters:{...p,k1,e_solo_kwh:eSolo,e_follower_kwh:eFollower,loiter_rate_kwh_per_min:loiterRate,hold_cost_per_sortie:holdCost},
    solver:{method:'bounded_dynamic_programming',status:scenarios.formation_with_wait.status,max_total_sorties:240,max_slices:48},
    resources:{flight_minutes_per_sortie:flightMinutes,cruise_energy_worst_case_kwh:cruiseWorstCase,
      wait_energy_per_slice_kwh:waitEnergy,
      battery_kwh:p.battery_kwh||null,battery_wait_cap_slices:batteryCap===Infinity?null:batteryCap,
      airborne_min_cap:p.max_airborne_min||null,airborne_wait_cap_slices:airborneCap===Infinity?null:airborneCap,
      user_wait_cap_slices:p.max_wait_slices||null,
      applied_wait_cap_slices:waitCapSlices===Infinity?null:waitCapSlices,
      service_per_slice:serviceCap===Infinity?null:serviceCap,
      active_constraints:active,blockers,resource_cap_effect:effect,
      realized_max_wait_slices:fifo.max_wait_slices,
      wait_cap_respected:fifo.max_wait_slices===null?null:(waitCapSlices===Infinity||fifo.max_wait_slices<=waitCapSlices),
      note:'逐机电池用「领航不打折」的单机巡航能耗作上界，因此对跟随机偏保守。'+
        '「每架最多等 W 片」在 FIFO 下等价于聚合约束 carried_t ≤ 最近 W 片到达数之和，'+
        '程序另外用 FIFO 队列独立复核实际最长等待。三个情景共用同一套物理约束，只有等待是否计费不同。'+
        'resource_cap_effect 是与「不加任何逐机资源上限」的同题对照：binding 为 false 时说明这些约束在本情景下没有改变结果。'},
    scenarios,scenario_cost:costs,saving_ideal:ideal,saving_timed:timed,
    saving_shrinkage:ideal!==null&&timed!==null&&ideal>1e-12?1-timed/ideal:null,
    plan:{rows,formations_by_slice:formations,formed_sorties:formed,total_sorties:N,formation_share:N&&rows.length?formed/N:0,
      realized_max_wait_slices:fifo.max_wait_slices}};
}
