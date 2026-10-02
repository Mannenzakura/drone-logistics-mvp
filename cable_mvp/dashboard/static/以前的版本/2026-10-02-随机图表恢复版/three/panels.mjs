import {formationRegions,regionPoint,REGION_LABELS,chiEtaSensitivity} from './experiments.mjs?v=20260929-fifo2';
import {winchStudy,WINCH_LABELS} from './winch.mjs?v=20260929-fifo2';
const $=id=>document.getElementById(id);
function number(id){const el=$(id),v=Number(el.value);if(el.value.trim()===''||!Number.isFinite(v))throw new Error(el.parentElement.textContent.trim()+'：请填写有效数值');return v;}
const format=v=>v===null?'不可达 / 无有限值':v.toFixed(1);
const WNUM=v=>v===null||v===undefined?'—':(Number.isInteger(v)?String(v):v.toFixed(2));
const wlim=t=>!t||t.value===null?(t&&t.status==='beyond_upper'?'搜索上界内始终可行':'搜索区间内不存在'):WNUM(t.value)+(t.status==='beyond_upper'?' 以上（超出搜索上界）':'');

// 索降作业三段计时面板：分区图 + 满额/盈亏阈值。所有阈值都只是所列离散模型的结果。
function setupWinch(){
  const fields={q:'w_q',height:'w_height',winch_capacity:'w_winch',hardware_mass:'w_hardware',
    box_mass:'w_box',W:'w_window',H:'w_window_h',approach_min:'w_approach',exit_min:'w_exit',
    exchange_fixed_min:'w_ex_fixed',exchange_per_kg_min:'w_ex_kg',
    cd:'w_cd',cl:'w_cl',F:'w_F',G:'w_G',e0:'w_e0',ed:'w_ed',el:'w_el',shared_airspace:'w_shared'};
  let data=null,view=null;
  const params=()=>Object.fromEntries(Object.entries(fields).map(([k,id])=>[k,number(id)]));
  function draw(){
    if(!data)return;
    const canvas=$('winchCanvas'),ctx=canvas.getContext('2d'),width=Math.max(280,canvas.clientWidth),height=310,ratio=window.devicePixelRatio||1;
    canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);
    const pad={l:56,r:12,t:24,b:44},iw=width-pad.l-pad.r,ih=height-pad.t-pad.b;
    const {x,y}=data.axes;
    const X=v=>pad.l+iw*v/(x.max||1),Y=v=>height-pad.b-ih*v/(y.max||1);
    view={width,height,pad,iw,ih,x,y};ctx.clearRect(0,0,width,height);ctx.font='11px system-ui';
    const colors=['#5f9e7f','#cbd9c6','#9fc6ae','#efe6d2','#d9b3a6'];
    const dx=iw/Math.max(1,data.grid[0].length-1),dy=ih/Math.max(1,data.grid.length-1);
    ctx.save();ctx.beginPath();ctx.rect(pad.l,pad.t,iw,ih);ctx.clip();
    data.grid.forEach((row,i)=>row.forEach((cell,j)=>{
      ctx.fillStyle=colors[cell];ctx.fillRect(X(x.values[j])-dx/2,Y(y.values[i])-dy/2,dx+1,dy+1);}));
    ctx.restore();ctx.setLineDash([]);ctx.fillStyle='#476155';ctx.strokeStyle='#9fb4a8';ctx.strokeRect(pad.l,pad.t,iw,ih);
    for(let i=0;i<=4;i++){const v=x.max*i/4;ctx.fillText(v.toFixed(x.max<3?2:0),X(v)-12,height-pad.b+17);}
    for(let i=0;i<=4;i++){const v=y.max*i/4;ctx.fillText(v.toFixed(y.max<3?2:0),8,Y(v)+4);}
    ctx.fillText(`${x.label} / ${x.unit}`,width/2-60,height-6);
    ctx.save();ctx.translate(12,pad.t+ih/2);ctx.rotate(-Math.PI/2);ctx.fillText(`${y.label} / ${y.unit}`,-72,0);ctx.restore();
    const t=data.thresholds;
    // 在图上标出「满额作业」与「盈亏平衡」两条边界（阈值落在坐标轴范围外时不画）
    const mark=(value,color,label)=>{
      if(value===null||value===undefined)return;
      if(value<=x.max){ctx.strokeStyle=color;ctx.setLineDash([5,3]);ctx.beginPath();ctx.moveTo(X(value),pad.t);ctx.lineTo(X(value),height-pad.b);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=color;ctx.fillText(label,X(value)+3,pad.t+11);}
      if(value<=y.max){ctx.strokeStyle=color;ctx.setLineDash([5,3]);ctx.beginPath();ctx.moveTo(pad.l,Y(value));ctx.lineTo(width-pad.r,Y(value));ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=color;ctx.fillText(label,pad.l+3,Y(value)-3);}
    };
    if(x.key==='window'||y.key==='window'){
      mark(t.window_break_even.value,'#bd4937','盈亏平衡窗口');
      mark(t.window_full_capability.value,'#27506b','满额作业窗口');
    }
  }
  function render(r){
    data=r;draw();
    const t=r.thresholds;
    $('winchGuide').textContent=`横轴：${r.axes.x.label}；纵轴：${r.axes.y.label}。同色区域＝该格上所列离散模型的最优决策；深绿＝双向作业且净收益为正，中绿＝双向作业但净收益非正，浅绿＝仅卸货且为正，米色＝仅卸货且非正，粉色＝不作业或不可行。`;
    $('winchSummary').innerHTML=
      `<div><span>允许的卸货上限 cap_d</span><strong>${r.derived.cap_d.toFixed(2)} kg</strong></div>`+
      `<div><span>允许的装货上限 cap_l</span><strong>${r.derived.cap_l.toFixed(2)} kg</strong></div>`+
      `<div><span>质量预算余量（扣 ${r.parameters.q} kg 固定货后）</span><strong>${r.derived.mass_budget.toFixed(2)} kg</strong></div>`+
      `<div><span>投送时间 τ_d(${r.parameters.height} m)</span><strong>${r.derived.tau_drop_per_kg.toFixed(3)} min/kg</strong></div>`+
      `<div><span>固定阶段合计</span><strong>${r.derived.t_fixed_min.toFixed(2)} min</strong></div>`+
      `<div><span>满额作业受限于</span><strong>${t.full_capability_limited_by??'不受限（可满额）'}</strong></div>`+
      Object.entries(r.summary.shares).map(([label,f])=>`<div><span>${label}</span><strong>${(f*100).toFixed(1)}%</strong></div>`).join('');
    $('winchThresholds').innerHTML=
      `<b>满额作业</b>（d=${r.derived.cap_d.toFixed(2)}、l=${r.derived.cap_l.toFixed(2)} kg 同时可行）需要：窗口 ≥ ${wlim(t.window_full_capability)} min，`+
      `电量 G ≥ ${t.energy_full_capability.value.toFixed(3)} kWh，地面换货 ≤ ${wlim(t.exchange_per_kg_full_capability)} min/kg；`+
      `最大作业高度 ${wlim(t.height_full_capability)} m，设备质量上限 ${wlim(t.equipment_mass_full_capability)} kg。`+
      `<br><b>盈亏平衡</b>需要：窗口 ≥ ${wlim(t.window_break_even)} min，电量 G ≥ ${wlim(t.energy_break_even)} kWh。`+
      `<br><b>仍能做一点点</b>的最大高度 ${wlim(t.height_max_runnable)} m；能承载的最大设备质量 ${wlim(t.equipment_mass_max)} kg；`+
      `最大固定 A→B 货物 ${wlim(t.q_max_runnable)} kg。`;
    $('winchNote').textContent='注意：只要允许任意小的 d>0，「可卸」几乎总是成立，所以分区占比会远大于「满额作业」占比；判断作业能力请以满额阈值与 cap_d/cap_l 为准。'+
      '投送高度律由公开图表两点定出，其线性截距为负，低于约 0.5 m 时被夹到 0；取货时间、地面换货、接近与退出时间都没有公开数据，是情景假设。'+
      '阈值只说明所列离散模型可行，不证明空域、电量与机械接口在实际任务中可用。';
    $('winchStatus').textContent='';
  }
  function update(){
    try{
      const p=params();p.x_axis=$('w_xaxis').value;p.y_axis=$('w_yaxis').value;
      if(p.x_axis===p.y_axis)throw new Error('横纵轴不能相同');
      render(winchStudy(p));
    }catch(e){$('winchStatus').textContent='新参数未应用：'+e.message;}
  }
  function hover(clientX,clientY){
    if(!view||!data)return;
    const rect=$('winchCanvas').getBoundingClientRect(),px=(clientX-rect.left)*view.width/rect.width,py=(clientY-rect.top)*view.height/rect.height;
    const xv=(px-view.pad.l)/view.iw*view.x.max,yv=(view.height-view.pad.b-py)/view.ih*view.y.max;
    if(xv<0||xv>view.x.max||yv<0||yv>view.y.max)return;
    const i=Math.min(data.grid.length-1,Math.max(0,Math.round(yv/data.summary.cell_y)));
    const j=Math.min(data.grid[0].length-1,Math.max(0,Math.round(xv/data.summary.cell_x)));
    const cell=data.detail[i][j];
    $('winchHover').textContent=`${view.x.label} ${xv.toFixed(2)} ${view.x.unit}，${view.y.label} ${yv.toFixed(2)} ${view.y.unit}：`+
      `${WINCH_LABELS[cell.cls]}${cell.cls===4?'':'（最优 d='+cell.d.toFixed(2)+'、l='+cell.l.toFixed(2)+' kg，净收益 '+cell.profit.toFixed(2)+'）'}`+
      `　上限 d ≤ ${cell.cap_d.toFixed(2)}、l ≤ ${cell.cap_l.toFixed(2)} kg${cell.full?'，该格可满额':''}`;
  }
  for(const id of [...Object.values(fields),'w_xaxis','w_yaxis'])$(id).addEventListener('input',update);
  $('winchCanvas').addEventListener('mousemove',e=>hover(e.clientX,e.clientY));
  $('winchCanvas').addEventListener('touchstart',e=>hover(e.touches[0].clientX,e.touches[0].clientY),{passive:true});
  new ResizeObserver(()=>{try{draw();}catch{}}).observe($('winchCanvas'));
  update();
  return {update};
}
export function setupPanels(getMain){
  let data=null,view=null,lastMarker=null,timingWorker=null,timingTimer=null,serial=0,lastTiming=null;
  const regionFields={formation_size:'r_formation_size',formation_role:'r_role',eta:'r_eta',propulsion_share:'r_chi',
    energy_price:'r_energy_price',time_value:'r_time_value',delay:'r_delay',coordination_cost:'r_coordination_cost',
    distance_max:'r_distance_max',speed:'r_speed',loiter:'r_loiter',allow_extrapolation:'r_extrapolation',payload_limit:'r_payload_limit',k0:'r_k0'};
  function draw(){
    if(!data)return;
    const canvas=$('regionCanvas'),ctx=canvas.getContext('2d'),width=Math.max(280,canvas.clientWidth),height=300,ratio=window.devicePixelRatio||1;
    canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);
    const pad={l:44,r:12,t:24,b:40},iw=width-pad.l-pad.r,ih=height-pad.t-pad.b;
    const x=d=>pad.l+iw*d/data.parameters.distance_max,y=q=>height-pad.b-ih*q/data.parameters.payload_max;
    view={width,height,pad,iw,ih};ctx.clearRect(0,0,width,height);ctx.font='11px system-ui';
    const colors=['#e8efe9','#9fc6ae','#5f9e7f','#f3e8d9','#d9b3a6'],dx=iw/data.parameters.distance_steps,dy=ih/data.parameters.payload_steps;
    ctx.save();ctx.beginPath();ctx.rect(pad.l,pad.t,iw,ih);ctx.clip();
    data.grid.forEach((row,i)=>row.forEach((cell,j)=>{ctx.fillStyle=colors[cell];ctx.fillRect(x(data.distances[j])-dx/2,y(data.payloads[i])-dy/2,dx+1,dy+1);}));
    function curve(values,color,dash){ctx.strokeStyle=color;ctx.lineWidth=1.7;ctx.setLineDash(dash);ctx.beginPath();let on=false;
      values.forEach((d,i)=>{if(d===null||!Number.isFinite(d)){on=false;return;}if(on)ctx.lineTo(x(d),y(data.payloads[i]));else{ctx.moveTo(x(d),y(data.payloads[i]));on=true;}});ctx.stroke();}
    curve(data.solo_boundary,'#41544a',[6,3]);curve(data.formation_boundary,'#12674f',[]);curve(data.break_even,'#8a5a2a',[2,4]);
    if(data.parameters.distance_max>110){ctx.strokeStyle='#9b8053';ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(x(110),pad.t);ctx.lineTo(x(110),height-pad.b);ctx.stroke();}
    const q=number('r_guide_payload'),point=regionPoint(data.parameters,data.derived,0,q);
    ctx.strokeStyle='#bd4937';ctx.setLineDash([5,3]);ctx.beginPath();ctx.moveTo(pad.l,y(q));ctx.lineTo(width-pad.r,y(q));ctx.stroke();ctx.setLineDash([]);
    for(const [d,color] of [[point.solo_distance,'#41544a'],[point.formation_distance,'#12674f'],[point.break_even,'#8a5a2a']]){
      if(d!==null&&d<=data.parameters.distance_max){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x(d),y(q),4,0,Math.PI*2);ctx.fill();}
    }
    const m=data.marker;if(m&&m.distance<=data.parameters.distance_max&&m.payload<=data.parameters.payload_max){ctx.fillStyle='#bd4937';ctx.beginPath();ctx.arc(x(m.distance),y(m.payload),4,0,Math.PI*2);ctx.fill();}
    ctx.restore();ctx.setLineDash([]);ctx.fillStyle='#476155';ctx.strokeStyle='#9fb4a8';ctx.strokeRect(pad.l,pad.t,iw,ih);
    for(let i=0;i<=4;i++){const d=data.parameters.distance_max*i/4;ctx.fillText(d.toFixed(0),x(d)-8,height-pad.b+17);}
    for(let q=0;q<=data.parameters.payload_max;q+=5)ctx.fillText(q+'',12,y(q)+4);
    ctx.fillText('载重 kg',5,13);ctx.fillText('航程 km',width/2-25,height-4);
    $('regionGuide').textContent=`指定载重 ${q.toFixed(1)} kg：单飞边界 ${format(point.solo_distance)} km ｜ 编队边界 ${format(point.formation_distance)} km ｜ 经济平衡 ${format(point.break_even)} km。平衡线仅在两者可达的范围内有比较意义；图外边界按数值显示，不挪到图边冒充真实边界。`;
  }
  function renderChiEta(p,q){
    let s;
    try{s=chiEtaSensitivity({...p,ref_payload:q});}catch(e){$('chiEtaNote').textContent='χη 扫描未计算：'+e.message;return;}
    const rows=s.rows;
    $('chiEtaTable').innerHTML='<tr><th>χη</th><th>γ</th><th>跟随巡航节能</th><th>编队边界 / km</th><th>比单飞多飞 / km</th></tr>'+
      rows.map(r=>`<tr${Math.abs(r.chi_eta-s.current_chi_eta)<1e-12?' style="font-weight:600"':''}>`+
        `<td>${r.chi_eta.toFixed(2)}</td><td>${r.gamma.toFixed(3)}</td><td>${(100*r.follower_saving).toFixed(2)}%</td>`+
        `<td>${r.formation_distance===null?'—':r.formation_distance.toFixed(2)}</td>`+
        `<td>${r.range_gain_km===null?'—':(r.range_gain_km>=0?'+':'')+r.range_gain_km.toFixed(2)}</td></tr>`).join('');
    const cur=s.current;
    $('chiEtaNote').textContent=
      `当前 χη=${s.current_chi_eta.toFixed(2)}（η=${p.eta}、χ=${p.propulsion_share}，${q.toFixed(1)} kg 参考载重）：`+
      (cur?`编队边界 ${cur.formation_distance===null?'—':cur.formation_distance.toFixed(2)} km，比单飞${cur.range_gain_km>=0?'多':'少'} ${Math.abs(cur.range_gain_km).toFixed(2)} km。`:'')+
      (s.summary.cheaper_in_sweep?`扫描到 χη=${s.summary.max_chi_eta_still_cheaper.toFixed(2)} 时编队仍比单飞便宜。`
        :'注意：在本参考载重与给定等待时长下，**整个扫描区间内编队都不比单飞便宜**（等待耗能与时效损失盖过节能），这是模型结论而不是程序错误。')+
      ' 文献核查结论：现有文献包内没有同量级同口径的一手全机节能值，原 χη ∈ [0.10, 0.18] 由二次引用的军机/运输机燃油数据拼成；'+
      '按「诱导阻力约占总阻力 45%（二手）× 巡航约占全机能量 60%（情景）」折算乐观上界约 8%，故默认取 0.06。见 docs 内的文献核查报告。';
  }
  function updateRegions(main){
    if(main&&Number.isFinite(main.distance_ac))lastMarker={distance:main.distance_ac+main.distance_cb,payload:main.q};
    try{
      const p=Object.fromEntries(Object.entries(regionFields).map(([k,id])=>[k,number(id)]));
      const q=number('r_guide_payload');if(q<0||q>35)throw new Error('指定载重须为 0–35 kg');
      const main=getMain();data=formationRegions({...p,marker:lastMarker||{distance:main.distance_ac+main.distance_cb,payload:main.q}});
      draw();$('regionStatus').textContent='';
      $('regionSummary').innerHTML=`<div><span>本机巡航节能（1−γ）</span><strong>${((1-data.derived.gamma)*100).toFixed(1)}%</strong></div>`+
        `<div><span>等待耗能 / kWh</span><strong>${data.derived.wait_energy.toFixed(3)}</strong></div>`+
        Object.entries(data.summary.shares).map(([label,f])=>`<div><span>${label}</span><strong>${(f*100).toFixed(1)}%</strong></div>`).join('');
      $('regionNote').textContent='虚线：单飞边界；实线：编队边界；点划线：经济平衡。110 km 以外须显式允许两方案同时外推。等待耗能同时进入电量约束和费用。比例是所选绘图范围内采样点的占比，不是实际需求概率。两点能量拟合不等于原论文整条线性载重曲线。';
      $('regionMarker').textContent=data.marker?`主任务参考点（总航程 ${data.marker.distance.toFixed(1)} km、固定货物 ${data.marker.payload.toFixed(1)} kg）：${REGION_LABELS[data.marker.region]}。这里只把它当作全段编队的独立单航段假设，不是 A→C→B 主任务的可飞判定。`:'';
      renderChiEta(p,q);
    }catch(e){$('regionStatus').textContent='新参数未应用：'+e.message;}
  }
  for(const id of [...Object.values(regionFields),'r_guide_payload'])$(id).addEventListener('input',()=>updateRegions());
  function hover(clientX,clientY){if(!view||!data)return;const rect=$('regionCanvas').getBoundingClientRect(),px=(clientX-rect.left)*view.width/rect.width,py=(clientY-rect.top)*view.height/rect.height;
    const D=(px-view.pad.l)/view.iw*data.parameters.distance_max,q=(view.height-view.pad.b-py)/view.ih*data.parameters.payload_max;
    if(D<0||D>data.parameters.distance_max||q<0||q>data.parameters.payload_max)return;
    const point=regionPoint(data.parameters,data.derived,D,q);$('regionHover').textContent=`${D.toFixed(1)} km，${q.toFixed(1)} kg：${REGION_LABELS[point.region]}${point.extrapolated?'（超出原文范围）':''}`;
  }
  $('regionCanvas').addEventListener('mousemove',e=>hover(e.clientX,e.clientY));
  $('regionCanvas').addEventListener('touchstart',e=>hover(e.touches[0].clientX,e.touches[0].clientY),{passive:true});
  new ResizeObserver(()=>{try{draw();}catch{}}).observe($('regionCanvas'));
  const fields={slice_minutes:'t_slice',distance:'t_distance',payload:'t_payload',formation_cap:'t_cap',gamma:'t_gamma',delta:'t_delta',D:'t_D',capacity_per_slice:'t_capacity',
    time_value:'t_time_value',energy_price:'t_energy_price',loiter:'t_loiter',allow_wait:'t_allow_wait',coordination_cost:'t_coord',speed:'t_speed',k0:'t_k0',
    battery_kwh:'t_battery',max_airborne_min:'t_airborne',max_wait_slices:'t_waitcap',service_per_slice:'t_service'};
  function timingParams(){
    const raw=$('t_demand').value.trim();if(!raw||!/^[0-9]+(?:\s*[,，\s]\s*[0-9]+)*$/.test(raw))throw new Error('需求请填写逗号或空格分隔的非负整数；不能自动丢弃非法项');
    return {...Object.fromEntries(Object.entries(fields).map(([k,id])=>[k,number(id)])),demand:raw.split(/[,，\s]+/).map(Number)};
  }
  function renderTiming(r){
    lastTiming=r;const money=v=>v===null?'不可比较':v.toFixed(2),c=r.scenario_cost,res=r.resources;
    $('timingSummary').innerHTML=`<div><span>总需求 / 已编队架次</span><strong>${r.plan.total_sorties} / ${r.plan.formed_sorties}</strong></div>`+
      `<div><span>免费等待下成本节省</span><strong>${money(r.saving_ideal)}</strong></div><div><span>计费等待下成本节省</span><strong>${money(r.saving_timed)}</strong></div>`+
      `<div><span>节省缩减比例</span><strong>${r.saving_shrinkage===null?'不可比较':(100*r.saving_shrinkage).toFixed(1)+'%'}</strong></div>`+
      `<div><span>实际最长等待 / 片</span><strong>${res.realized_max_wait_slices===null?'—':res.realized_max_wait_slices}</strong></div>`+
      `<div><span>单机巡航耗能 / kWh</span><strong>${res.cruise_energy_worst_case_kwh.toFixed(3)}</strong></div>`+
      `<div><span>每片等待耗能 / kWh</span><strong>${res.wait_energy_per_slice_kwh.toFixed(3)}</strong></div>`;
    const max=Math.max(...Object.values(c).filter(v=>v!==null),.001);
    $('timingBars').innerHTML=[['solo_only','全单飞（等待同样计费）'],['formation_free_wait','编队 · 等待免费下界'],['formation_with_wait','编队 · 等待计费']].map(([k,label])=>`<div class="cost-row"><span>${label}</span><progress max="${max}" value="${c[k]??0}"></progress><b>${c[k]===null?'不可行':c[k].toFixed(2)+' 单位'}</b></div>`).join('');
    const e=res.resource_cap_effect;
    const parts=[];
    if(res.applied_wait_cap_slices!==null)parts.push(`每架等待上限 ${res.applied_wait_cap_slices} 片（来自：${res.active_constraints.filter(x=>x!=='机场服务率').join('、')||'—'}）`);
    if(res.service_per_slice!==null)parts.push(`每片服务能力 ${res.service_per_slice} 架`);
    $('timingResources').innerHTML=res.blockers.length
      ?`<b>逐机资源不可行：</b>${res.blockers.join('；')}。这不是成本问题，而是这些架次在该资源下根本无法执行。`
      :(parts.length
        ?`逐机资源：${parts.join('；')}。FIFO 独立复核实际最长等待 ${res.realized_max_wait_slices} 片，${res.wait_cap_respected===false?'<b>超过上限</b>':'未超上限'}。`
          +(e?`同题对照（不加任何逐机资源上限）：成本 ${e.cost_without_resource_caps===null?'不可行':e.cost_without_resource_caps.toFixed(2)} → 加限后 ${e.cost_with_resource_caps===null?'不可行':e.cost_with_resource_caps.toFixed(2)}，${e.binding?'<b>这些约束确实改变了结果</b>':'这些约束在本情景下没有改变结果'}。`:'')
        :'逐机资源：本例没有施加电池、等待时长或服务率上限（四项都是 0），因此「调度可行」仍然不等于「电量够飞」。');
    $('timingPlan').textContent=r.plan.rows.length?'计费编队方案：逐片记录新到、结转、单飞、编队和等待。':'计费编队方案不可行。其他情景仍分别显示；不可行不是零成本。';
    $('timingRows').innerHTML=r.plan.rows.map(row=>`<tr><td>${row.slice}</td><td>${row.ready}</td><td>${row.carried}</td><td>${row.solo}</td><td>${row.parts.filter(m=>m>1).join(' + ')||'—'}</td><td>${row.departed}</td><td>${row.held}</td><td>${row.occupancy.toFixed(2)}</td><td>${(row.departure_cost+row.charged_wait_cost).toFixed(2)}</td></tr>`).join('');
    $('timingExport').disabled=false;
  }
  function calculateTiming(){
    const id=++serial;if(timingWorker)timingWorker.terminate();clearTimeout(timingTimer);
    let parameters;try{parameters=timingParams();}catch(e){$('timingStatus').textContent='新参数未应用：'+e.message;return;}
    $('timingStatus').textContent='正在计算；上一次结果暂时保留…';
    timingWorker=new Worker(new URL('./worker.mjs?v=20260929-fifo2',import.meta.url),{type:'module'});
    const current=timingWorker;
    timingTimer=setTimeout(()=>{current.terminate();if(id===serial)$('timingStatus').textContent='计算超时，请缩小需求；上一次结果保留。';},15000);
    current.onmessage=({data})=>{clearTimeout(timingTimer);current.terminate();if(id!==serial)return;
      if(data.error){$('timingStatus').textContent='新参数未应用：'+data.error;return;}
      renderTiming(data.result);$('timingStatus').textContent=data.result.solver.status==='resource_infeasible'
        ?'计算完成 · 逐机资源不足，三个情景都不可行；请放宽电池、等待时长或服务能力。'
        :'计算完成 · 所列离散模型的全局最优 / 各情景独立报告可行性。';};
    current.onerror=()=>{clearTimeout(timingTimer);current.terminate();if(id===serial)$('timingStatus').textContent='计算模块加载失败，请刷新重试。';};
    current.postMessage({task:'timing',parameters});
  }
  $('timingApply').onclick=calculateTiming;
  for(const id of [...Object.values(fields),'t_demand'])$(id).addEventListener('input',()=>{$('timingStatus').textContent='参数尚未应用，请点击“计算时间片方案”；表格和导出仍对应上次结果。';});
  $('timingExport').onclick=()=>{if(!lastTiming)return;const u=URL.createObjectURL(new Blob([JSON.stringify(lastTiming,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download='formation-timing.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
  updateRegions();calculateTiming();const winch=setupWinch();return {updateRegions,updateWinch:winch.update};
}
