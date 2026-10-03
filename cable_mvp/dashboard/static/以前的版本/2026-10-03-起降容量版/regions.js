'use strict';
// 编队 vs 单飞：距离 × 载重分区面板。数据来自 /api/formation-regions。
// 面板参数独立于主任务表单：主模型计算失败不影响本面板刷新。
(function(){
const FIELDS=[['formation_size','编队总架数 m',1,8,1],['formation_role','角色(1跟随2轮换3领航0单飞)',0,3,1],
  ['eta','减阻参数 η',0,1,.01],['propulsion_share','气动能耗占比 χ',0,1,.01],
  ['k0','巡航固定项 k0 / kWh·km⁻¹',0,1,.001],['energy_price','电价 / 单位·kWh⁻¹',0,100,.1],
  ['time_value','时效价值 / 单位·kg⁻¹·min⁻¹',0,1,.001],['delay','等待+入队 delay / min',0,120,.5],
  ['coordination_cost','编队协调固定成本 / 单位',0,100,.5],['distance_max','距离上限 / km',20,200,5],
  ['guide_payload','指定载重 m* / kg',0,35,.5],['speed','巡航速度 / km·h⁻¹',1,500,1],['loiter','等待按盘旋计能(1是0否)',0,1,1]];
const COLORS={0:'#e8efe9',1:'#9fc6ae',2:'#5f9e7f',3:'#f3e8d9'};
const LABELS={0:'均可达 · 单飞更省',1:'均可达 · 编队更省',2:'单飞不可达 · 仅编队可达',3:'均不可达'};
let defaults={},lastData=null,view=null;
function $(id){return document.getElementById(id);}
function inputs(){const p={};for(const [k] of FIELDS)p[k]=Number($('r_'+k).value);return p;}
async function refresh(){
  const body={parameters:inputs()};
  const marker=window.__regionMarker;
  if(marker)body.marker=marker;
  let data;
  try{
    const res=await fetch('/api/formation-regions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    data=await res.json();
    if(!res.ok)throw new Error(data.error||'计算失败');
  }catch(err){$('regionStatus').textContent='⚠ '+err.message;return;}
  $('regionStatus').textContent='';
  lastData=data;draw(data);summarize(data);
}
function draw(d){
  const canvas=$('regionCanvas'),ctx=canvas.getContext('2d');
  const w=canvas.width=Math.max(560,canvas.clientWidth)*2,h=canvas.height=560;
  const pad={l:110,r:110,t:30,b:70};
  const x=v=>pad.l+(w-pad.l-pad.r)*v/d.parameters.distance_max;
  const y=v=>h-pad.b-(h-pad.t-pad.b)*v/d.parameters.payload_max;
  view={pad,w,h,dmax:d.parameters.distance_max,pmax:d.parameters.payload_max};
  ctx.clearRect(0,0,w,h);
  ctx.font='26px system-ui,sans-serif';
  const di=d.distances,pl=d.payloads;
  for(let i=0;i<pl.length;i++)for(let j=0;j<di.length;j++){
    ctx.fillStyle=COLORS[d.grid[i][j]];
    ctx.fillRect(x(di[j]-(di[1]-di[0])/2),y(pl[i]+(pl[1]-pl[0])/2),(di[1]-di[0])/d.parameters.distance_max*(w-pad.l-pad.r)+1,(pl[1]-pl[0])/d.parameters.payload_max*(h-pad.t-pad.b)+1);
  }
  const curve=(values,color,dash)=>{ctx.strokeStyle=color;ctx.lineWidth=4;ctx.setLineDash(dash);ctx.beginPath();let started=false;
    for(let i=0;i<pl.length;i++){const v=values[i];if(v===null||!isFinite(v)){started=false;continue;}
      const px=x(Math.min(v,d.parameters.distance_max)),py=y(pl[i]);
      if(!started){ctx.moveTo(px,py);started=true;}else ctx.lineTo(px,py);}
    ctx.stroke();ctx.setLineDash([]);};
  curve(d.solo_boundary,'#41544a',[10,6]);
  curve(d.formation_boundary,'#12674f',[]);
  curve(d.break_even,'#8a5a2a',[4,6]);
  if(d.parameters.distance_max>110){
    ctx.strokeStyle='#b39b6e';ctx.lineWidth=3;ctx.setLineDash([3,5]);
    ctx.beginPath();ctx.moveTo(x(110),y(0));ctx.lineTo(x(110),y(d.parameters.payload_max));ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle='#7a6642';ctx.fillText('110 km 原文适用范围',x(110)+8,y(d.parameters.payload_max)+26);
  }
  ctx.fillStyle='#3a4a42';ctx.strokeStyle='#b9c8c0';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(pad.l,pad.t);ctx.lineTo(pad.l,h-pad.b);ctx.lineTo(w-pad.r,h-pad.b);ctx.stroke();
  for(let v=0;v<=d.parameters.distance_max;v+=20){ctx.fillText(v+' km',x(v)-18,h-pad.b+36);ctx.beginPath();ctx.moveTo(x(v),h-pad.b);ctx.lineTo(x(v),h-pad.b+8);ctx.stroke();}
  for(let v=0;v<=d.parameters.payload_max;v+=5){ctx.fillText(v+' kg',18,y(v)+10);ctx.beginPath();ctx.moveTo(pad.l-8,y(v));ctx.lineTo(pad.l,y(v));ctx.stroke();}
  ctx.fillText('航程 D / km',w/2-90,h-14);
  ctx.save();ctx.translate(30,h/2+90);ctx.rotate(-Math.PI/2);ctx.fillText('载重 m / kg',0,0);ctx.restore();
  // 指定载重 m*：横向引导线 + 单飞/编队/经济平衡三个可达距离标记
  const mStar=Math.max(0,Math.min(d.parameters.payload_max,Number($('r_guide_payload').value)||0));
  const idx=Math.min(pl.length-1,Math.max(0,Math.round(mStar/d.parameters.payload_max*(pl.length-1))));
  const dSolo=d.solo_boundary[idx],dForm=d.formation_boundary[idx],dBe=d.break_even[idx];
  ctx.strokeStyle='#c0392b';ctx.lineWidth=3;ctx.setLineDash([14,8]);
  ctx.beginPath();ctx.moveTo(pad.l,y(mStar));ctx.lineTo(w-pad.r,y(mStar));ctx.stroke();ctx.setLineDash([]);
  const dot=(D,label,color)=>{if(D==null||!isFinite(D))return;const px=x(Math.min(D,d.parameters.distance_max));
    ctx.fillStyle=color;ctx.beginPath();ctx.arc(px,y(mStar),10,0,Math.PI*2);ctx.fill();
    ctx.save();ctx.translate(px-14,y(mStar)-16);ctx.rotate(-.6);ctx.fillText(label,0,0);ctx.restore();};
  dot(dSolo,'单飞 '+dSolo.toFixed(1),'#41544a');
  dot(dForm,'编队 '+dForm.toFixed(1),'#12674f');
  dot(dBe,'平衡 '+(dBe==null?'—':dBe.toFixed(1)),'#8a5a2a');
  if(d.marker){
    ctx.fillStyle='#c0392b';ctx.beginPath();
    ctx.arc(x(Math.min(d.marker.distance,d.parameters.distance_max)),y(Math.min(d.marker.payload,d.parameters.payload_max)),9,0,Math.PI*2);ctx.fill();
    ctx.fillText('当前任务 (q)',x(Math.min(d.marker.distance,d.parameters.distance_max))+14,y(Math.min(d.marker.payload,d.parameters.payload_max))+8);
  }
  $('regionGuide').textContent=`指定载重 ${mStar.toFixed(1)} kg：单飞最远 ${dSolo.toFixed(1)} km ｜ 编队最远 ${dForm.toFixed(1)} km ｜ 编队/单飞经济平衡 ${dBe===null?'不存在（当前编队参数无节能）':dBe.toFixed(1)+' km'}（该线以右编队更省）`;
}
function classifyAt(dd,mm){
  if(!lastData)return null;
  const di=lastData.distances,pl=lastData.payloads;
  if(dd<di[0]||dd>di[di.length-1]||mm<pl[0]||mm>pl[pl.length-1])return null;
  const i=Math.min(pl.length-1,Math.max(0,Math.round(mm/pl[pl.length-1]*(pl.length-1))));
  const j=Math.min(di.length-1,Math.max(0,Math.round(dd/di[di.length-1]*(di.length-1))));
  return lastData.grid[i][j];
}
function summarize(d){
  const s=d.summary,c=s.counts,sh=s.shares||{};
  const pct=v=>(v*100).toFixed(1)+'%';
  $('regionSummary').innerHTML=['γ','drag_reduction'].map(k=>`<div><span>${k==='γ'?'编队能耗系数 γ':'减阻比例'}</span><strong>${d.derived[k].toFixed(4)}</strong></div>`).join('')
  const chiEta=s.chi_eta!==undefined?s.chi_eta:(d.parameters.eta*d.parameters.propulsion_share);
    +`<div><span>χ·η（文献区间 0.10–0.18）</span><strong>${chiEta.toFixed(3)}</strong></div>`
    +Object.keys(LABELS).map(k=>`<div><span>${LABELS[k]}</span><strong>${pct(sh[LABELS[k]]||(c[LABELS[k]]||0)/s.total)}</strong></div>`).join('')
    +`<div><span>其中超出 110 km 外推</span><strong>${pct(s.extrapolated_share!==undefined?s.extrapolated_share:s.extrapolated_beyond_110km/s.total)}</strong></div>`;
  const i20=d.payloads.indexOf(d.payloads.reduce((b,v)=>Math.abs(v-20)<Math.abs(b-20)?v:b,d.payloads[0]));
  const cell=`每格 ≈ ${s.cell_width_km!==undefined?s.cell_width_km.toFixed(2):d.parameters.distance_max/d.parameters.distance_steps} km × ${s.cell_height_kg!==undefined?s.cell_height_kg.toFixed(1):d.parameters.payload_max/d.parameters.payload_steps} kg，统计为该区域占全部 ${s.total} 格的百分比。`;
  $('regionNote').textContent=`k1 由原文 (70km,20kg)、(110km,10kg) 两点反解。20 kg 载重：单飞最远 ${d.solo_boundary[i20].toFixed(1)} km，编队最远 ${d.formation_boundary[i20].toFixed(1)} km；虚线＝单飞边界，实线＝编队边界，点划线＝编队与单飞经济盈亏平衡（在其右上方编队更省）。${cell}超过 110 km 的编队可达区属于线性能量外推，未经原文验证。`;
  if(d.marker){
    const at=classifyAt(d.marker.distance,d.marker.payload);
    $('regionMarker').textContent=`当前任务点（${d.marker.distance.toFixed(1)} km，${d.marker.payload.toFixed(1)} kg）落在：${d.region_labels[at]??LABELS[at]??''}`;
  }
}
function hover(clientX,clientY){
  const canvas=$('regionCanvas');
  if(!lastData||!view){$('regionHover').textContent='';return;}
  const rect=canvas.getBoundingClientRect(),px=(clientX-rect.left)*2,py=(clientY-rect.top)*2;
  const {pad,w,h,dmax,pmax}=view;
  if(px<pad.l-6||px>w-pad.r+6||py<pad.t-6||py>h-pad.b+6){$('regionHover').textContent='';return;}
  const dd=(px-pad.l)/(w-pad.l-pad.r)*dmax,mm=(h-pad.b-py)/(h-pad.t-pad.b)*pmax;
  const cell=classifyAt(dd,mm);
  $('regionHover').textContent=cell===null?'':`📍 ${dd.toFixed(1)} km，${mm.toFixed(1)} kg → ${LABELS[cell]}`;
}
function init(){
  const box=$('regionFields');
  for(const [k,label,min,max,step] of FIELDS){
    const el=document.createElement('label');el.textContent=label;
    const input=document.createElement('input');input.type='number';input.id='r_'+k;input.step=step;input.min=min;input.max=max;
    el.append(input);box.append(el);
  }
  fetch('/api/defaults').then(r=>r.json()).then(d=>{
    defaults=d.region_defaults||{};
    for(const [k] of FIELDS)if(defaults[k]!==undefined)$('r_'+k).value=defaults[k];
    refresh();
  });
  $('regionRefresh').addEventListener('click',refresh);
  box.addEventListener('input',()=>{clearTimeout(box._t);box._t=setTimeout(refresh,400);});
  window.addEventListener('mission-updated',e=>{window.__regionMarker={distance:e.detail.distance,payload:e.detail.payload};refresh();});
  $('regionCanvas').addEventListener('mousemove',e=>hover(e.clientX,e.clientY));
  $('regionCanvas').addEventListener('mouseleave',()=>$('regionHover').textContent='');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

// 时间片原型面板（简版）：数据来自 /api/formation-timing
(function(){
const FIELDS=[['demand_text','各片就绪架数(逗号分隔)'],['slice_minutes','片长 / min',5,1440,5],
  ['distance','航程 / km',1,500,1],['payload','载重 / kg',0,35,.5],['formation_cap','最大编队 m̄',1,8,1],
  ['gamma','γ（follower 能耗系数）',.01,1,.01],['delta','队内间距 δ / km',.01,10,.1],['D','单机占用 D / km',.1,50,.1],
  ['capacity_per_slice','每片容量 / km·走廊',.1,1000,1],['time_value','时效价值 / 单位·kg⁻¹·min⁻¹',0,1,.001],
  ['energy_price','电价 / 单位·kWh⁻¹',0,100,.1],['loiter_t','等待计费(1时效+盘旋 0仅时效)',0,1,1],
  ['allow_wait','允许跨片等待(1是0否)',0,1,1]];
function $(id){return document.getElementById(id);}
function params(){const p={};for(const [k,,,,def] of FIELDS){if(k==='demand_text')continue;
  const el=$('t2_'+k);let v=Number(el.value);if(!Number.isFinite(v))v=def;p[k==='loiter_t'?'loiter':k]=v;}
  p.demand=String($('t2_demand_text').value).split(/[,，\s]+/).map(Number).filter(x=>Number.isInteger(x)&&x>=0);
  return p;}
async function refresh(){
  let data;
  try{
    const res=await fetch('/api/formation-timing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({parameters:params()})});
    data=await res.json();
    if(!res.ok)throw new Error(data.error||'计算失败');
  }catch(err){$('timingStatus').textContent='⚠ '+err.message;return;}
  $('timingStatus').textContent='';
  const c=data.scenario_cost;
  const pct=data.saving_shrinkage===null?'—':(data.saving_shrinkage*100).toFixed(1)+'%';
  $('timingSummary').innerHTML=
    `<div><span>总架次 / 编队率</span><strong>${data.plan.total_sorties} · ${(data.plan.formation_share*100).toFixed(0)}%</strong></div>`+
    `<div><span>理想同步节能（等待免费）</span><strong>${data.saving_ideal.toFixed(2)}</strong></div>`+
    `<div><span>等待计费后节能</span><strong>${data.saving_timed.toFixed(2)}</strong></div>`+
    `<div><span>节能缩水（同步代价）</span><strong>${pct}</strong></div>`;
  $('timingPlan').textContent='三情景成本：全单飞 '+c.solo_only.toFixed(2)+' ｜ 理想同步 '+c.formation_free_wait.toFixed(2)+' ｜ 等待计费 '+c.formation_with_wait.toFixed(2)+'；各片编队：'+
    data.plan.formations_by_slice.map((f,i)=>`片${i+1}[${f.join('+')||'—'}]`).join(' ');
}
function init(){
  const box=$('timingFields');if(!box)return;
  for(const [k,label,min,max,step] of FIELDS){
    const el=document.createElement('label');el.textContent=label;
    const input=document.createElement('input');
    if(k==='demand_text'){input.type='text';input.value='3,5,8,10,9,6,4';}
    else{input.type='number';input.step=step;input.min=min;input.max=max;
      const defaults={slice_minutes:60,distance:70,payload:10,formation_cap:8,gamma:.9,delta:.5,D:3,capacity_per_slice:40,time_value:.015,energy_price:1,loiter_t:1,allow_wait:1};
      input.value=defaults[k];}
    input.id='t2_'+k;el.append(input);box.append(el);
  }
  box.addEventListener('input',()=>{clearTimeout(box._t);box._t=setTimeout(refresh,400);});
  refresh();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
