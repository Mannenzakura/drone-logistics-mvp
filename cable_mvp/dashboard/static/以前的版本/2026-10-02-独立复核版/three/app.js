'use strict';
import {setupPanels} from './panels.mjs?v=20260929-fifo2';
import {DEFAULTS,CARGO_PROFILES,exportCsv,formationRegions,formationTiming,REGION_LABELS,simulate as simulateModel} from './model.mjs?v=20260929-fifo2';
import {assignFifo,assignWithDeferral,averageWaitApprox} from './fifo.mjs?v=20260929-fifo2';
function compute(body){return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./worker.mjs?v=20260929-fifo2',import.meta.url),{type:'module'});
  const timer=setTimeout(()=>{worker.terminate();reject(new Error('计算超时，请缩小参数范围后重试'));},15000);
  worker.onmessage=({data})=>{clearTimeout(timer);worker.terminate();if(data.error)reject(new Error(data.error));else resolve(data.result);};
  worker.onerror=()=>{clearTimeout(timer);worker.terminate();reject(new Error('浏览器计算模块加载失败，请刷新后重试'));};
  worker.postMessage(body);
});}
const $ = id => document.getElementById(id);
const primary = [['distance_ac','A → C / km'],['distance_cb','C → B / km'],['speed','巡航 / km/h'],['q','固定货物 q / kg'],['W','可作业时间 / min'],['H','空域窗口 / min'],['B','可拆卸仓 / kg'],['Q','净货物上限 / kg'],['D','卸货需求 / kg'],['L','装货需求 / kg']];
const advanced = [['t0','固定作业 / min'],['td','卸货 / min·kg⁻¹'],['tl','装货 / min·kg⁻¹'],['join_buffer','入队缓冲 / min'],['G','单飞基准余量 / kWh'],['e0','固定作业增量 / kWh'],['ed','30km载重增量 / kWh·kg⁻¹'],['el','40km载重增量 / kWh·kg⁻¹'],['equipment_mass','新增设备 / kg'],['bd','卸货净贡献（单飞口径）'],['bl','装货净贡献（单飞口径）'],['F','固定成本 / 单位'],['cruise_empty','巡航固定项 / kWh·km⁻¹'],['energy_price','电价 / 单位·kWh⁻¹'],['cargo_fee','货运收费 / 单位·kg⁻¹'],['time_value','时效价值 / 单位·kg⁻¹·min⁻¹'],['handling_cost','装卸成本 / 单位·kg⁻¹'],['direct_distance','直飞 A→B / km'],['direct_payload_energy','直飞载重能耗 / kWh·kg⁻¹'],['direct_fixed_cost','直飞固定成本 / 单位']];
const formationFields=[['formation_size','编队总架数 m'],['eta','减阻参数 η / 0–1'],['propulsion_share','气动能耗占比 χ / 0–1']];
const cargoGroups=[['q','常规货舱 · A→B','q'],['d','可拆卸仓 · A→C 卸货','D'],['l','可拆卸仓 · C→B 新装','L']];
const cargoFields=cargoGroups.flatMap(([g])=>[[`fee_${g}`,`${g} 货运收费 / 单位·kg⁻¹`],[`time_${g}`,`${g} 时效系数 / 单位·kg⁻¹·min⁻¹`],[`handling_${g}`,`${g} 处理成本 / 单位·kg⁻¹`]]);
const activeAdvanced=advanced.filter(([k])=>!['cargo_fee','time_value','handling_cost','bd','bl'].includes(k));
const allFields=[...primary,...activeAdvanced,...formationFields,...cargoFields];
let defaults, mission=null, fifoState=null, t=0, playing=false, lastFrame=0, requestNumber=0;
function makeFields(items, container){
  for(const [key,label] of items){
    const el=document.createElement('label');el.textContent=label;
    const input=document.createElement('input');input.type='number';input.id='p_'+key;input.step='any';input.required=true;
    if(!['bd','bl'].includes(key))input.min='0';
    if(['speed','distance_ac','distance_cb'].includes(key))input.min='0.001';
    el.append(input);$(container).append(el);
  }
}
makeFields(primary,'primaryFields');makeFields(activeAdvanced,'advancedFields');makeFields(formationFields,'formationFields');
for(const [g,title,quantity] of cargoGroups){
  const fieldset=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent=title;fieldset.append(legend);
  const label=document.createElement('label');label.textContent=`${g} 货物类型`;
  const select=document.createElement('select');select.id=`cargoType_${g}`;
  for(const [value,text] of [['standard','普通件'],['express','时效件'],['medical','医疗/高价值件']]){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}
  label.append(select);fieldset.append(label);
  const fields=document.createElement('div');fields.className='fields';fields.id=`cargoFields_${g}`;fieldset.append(fields);$('cargoGroups').append(fieldset);
  fields.append($('p_'+quantity).parentElement);makeFields(cargoFields.filter(([k])=>k.endsWith('_'+g)),fields.id);
  select.addEventListener('change',()=>{applyCargoProfile(g);$('dirty').hidden=false;});
}
$('p_formation_size').min=1;$('p_formation_size').max=8;$('p_formation_size').step=1;$('p_eta').max=1;$('p_propulsion_share').max=1;
function updateAirspaceInputs(){
  const shared=$('sharedAirspace').checked;
  $('p_H').disabled=!shared;$('airspace').disabled=!shared;
  $('airspaceHint').textContent=shared?'占用共享空域：作业须同时满足机场空域窗口与编队衔接时间。':'机场外独立卸货区：假设不影响机场起降，机场空域窗口不适用；仍受衔接时间、装卸能力与能量限制。暂未计入往返独立区域的额外航程。';
}
function applyCargoProfile(g){const profile=defaults?.cargo_profiles?.[$('cargoType_'+g).value];if(!profile)return;for(const [dest,src] of [['fee','cargo_fee'],['time','time_value'],['handling','handling_cost']])$('p_'+dest+'_'+g).value=profile[src];}
function fillDefaults(){for(const [key] of allFields)$('p_'+key).value=defaults[key];
  $('allowExtrap').checked=!!defaults.allow_extrapolation;$('extrapolationNote').hidden=true;for(const [g] of cargoGroups){$('cargoType_'+g).value='standard';applyCargoProfile(g);}$('formationRole').value=String(defaults.formation_role);$('airspace').checked=!!defaults.a;$('sharedAirspace').checked=!!defaults.shared_airspace;updateAirspaceInputs();document.querySelector('[value="optimal"]').checked=true;document.querySelector('.manual').hidden=true;}
function setPlaying(value){playing=value;$('play').textContent=value?'Ⅱ 暂停':'▶ 播放';lastFrame=performance.now();}
function showCalculationError(message){
  $('error').textContent=message+ (mission?'。新参数未应用，画面保留上一次计算结果。修改后可重新计算。':'。请修改后重新计算。');
  $('error').hidden=false;$('dirty').hidden=false;
  $('validValue').textContent=mission?'修改未应用 · 保留旧结果':'尚无计算结果';
  $('validValue').className='bad';
}
function validateInputs(){
  const inputs=[...$('form').querySelectorAll('input[type="number"]')];
  for(const input of inputs){
    if(input.disabled || (input.closest('.manual') && document.querySelector('[name="mode"]:checked').value!=='manual'))continue;
    if(input.value.trim()==='' || !Number.isFinite(input.valueAsNumber) || !input.checkValidity()){
      const details=input.closest('details');if(details)details.open=true;
      const label=input.parentElement.textContent.trim();
      const range=[input.min!==''?`最小 ${input.min}`:'',input.max!==''?`最大 ${input.max}`:'',input.step==='1'?'须为整数':''].filter(Boolean).join('，');
      showCalculationError(`请检查“${label}”：请输入有效数值${range?'（'+range+'）':''}`);
      input.focus();return false;
    }
  }
  return true;
}
function formParameters(){
  const parameters={};for(const [key] of allFields)parameters[key]=Number($('p_'+key).value);
  parameters.formation_role=Number($('formationRole').value);
  parameters.a=$('airspace').checked?1:0;
  parameters.shared_airspace=$('sharedAirspace').checked?1:0;
  parameters.allow_extrapolation=$('allowExtrap').checked?1:0;
  return parameters;
}
async function calculate(options={}){
  if(!validateInputs())return;
  const seq=++requestNumber;setPlaying(false);$('apply').disabled=true;$('error').hidden=true;
  const parameters=formParameters();
  if(options.parameters)Object.assign(parameters,options.parameters);
  const body={parameters,cargo_types:Object.fromEntries(cargoGroups.map(([g])=>[g,$('cargoType_'+g).value])),mode:options.mode||document.querySelector('[name="mode"]:checked').value,d:Number($('manualD').value),l:Number($('manualL').value)};
  try{
    const data=options.precomputed||await compute(body);if(seq!==requestNumber)return;
    if(!data.economics || !Array.isArray(data.economics.cargo_rows) || !data.formation || !Array.isArray(data.checks) || !Array.isArray(data.segments))throw new Error('计算结果无法读取，请刷新页面后重试');
    mission=data;mission.request=body;fifoState=options.fifoState||null;t=0;$('dirty').hidden=true;
    $('dropValue').textContent=`${data.d.toFixed(2)} kg`;$('loadValue').textContent=`${data.l.toFixed(2)} kg`;
    const cp=data.parameters,cr=data.economics.cargo_rows;
    const incremental=cr.slice(1).reduce((sum,c)=>sum+c.revenue-c.time_cost-c.handling_cost,0)-cp.energy_price*data.incremental_energy-cp.F*data.z;
    $('profitValue').innerHTML=`${incremental.toFixed(2)} <small>货币单位</small>`;
    $('validValue').textContent=data.valid?(data.z?'可作业 · 情景内':'不作业'):'方案不可行';
    $('validValue').className=data.valid?'good':'bad';
    const fm=data.formation;
    $('savingRate').textContent=`${((1-fm.gamma)*100).toFixed(2)}%`;
    $('gammaValue').textContent=`γ = ${fm.gamma.toFixed(4)} · 减阻比例 ${(fm.drag_reduction*100).toFixed(2)}%`;
    $('cbComparison').textContent=`${fm.cb_solo.toFixed(3)} → ${fm.cb_form.toFixed(3)} kWh`;
    $('savedTotal').textContent=`全段预计节省 ${fm.saving.toFixed(3)} kWh（本机）`;
    const ec=data.economics,waitCost=fifoState?fifoState.waitEnergy*cp.energy_price:0,adjustedNet=ec.transfer_net_benefit-waitCost,adjustedDelta=ec.delta_vs_direct===null?null:ec.delta_vs_direct-waitCost;
    $('cargoLabelValue').textContent=ec.cargo_label;$('transferNet').textContent=`${adjustedNet.toFixed(2)} 单位`;$('transferBreakdown').textContent=`收费 ${ec.transfer_revenue.toFixed(2)} · 时效损失 ${ec.transfer_time_cost.toFixed(2)} · 运行成本 ${ec.transfer_operating_cost.toFixed(2)}${fifoState?` · 估计等待电费 ${waitCost.toFixed(2)}`:''}`;$('directNet').textContent=ec.direct.feasible?`${ec.direct.net_benefit.toFixed(2)} 单位`:'不可行';$('directBreakdown').textContent=ec.direct.feasible?`货量 ${ec.direct.mass_kg.toFixed(2)} kg · 能耗 ${ec.direct.energy_kwh.toFixed(2)} kWh`:`${ec.direct.reason}`;$('deltaDirect').textContent=adjustedDelta===null?'—':`${adjustedDelta>=0?'+':''}${adjustedDelta.toFixed(2)} 单位`;
    $('formation').replaceChildren();for(let i=0;i<parameters.formation_size-1;i++){const mate=document.createElementNS('http://www.w3.org/2000/svg','use');mate.setAttribute('href','#plane');$('formation').append(mate);}
    $('cargoRows').replaceChildren();for(const c of ec.cargo_rows){const tr=document.createElement('tr');for(const value of [cargoGroups.find(([g])=>g===c.group)[1],c.label,c.mass.toFixed(2),c.fee.toFixed(2),c.revenue.toFixed(2),c.time_cost.toFixed(2),c.handling_cost.toFixed(2)]){const td=document.createElement('td');td.textContent=value;tr.append(td);}$('cargoRows').append(tr);}
    for(const id of ['play','restart','next','seek','export'])$(id).disabled=!data.valid;
    $('labelAC').textContent=`${parameters.distance_ac} km`;$('labelCB').textContent=`${parameters.distance_cb} km`;
    $('zoneLabel').textContent=parameters.shared_airspace?'C 点共享空域作业区':'C 点机场外独立卸货区 · 假设不影响起降';
    $('operationZone').setAttribute('fill',parameters.shared_airspace?'#e0f0e9':'#f3e8cd');
    renderChecks();renderPhases();
    if(!data.valid){$('error').textContent='超限：'+data.checks.filter(c=>!c.ok).map(c=>c.name).join('、')+'。请修改参数后重新计算。';$('error').hidden=false;}
    render();drawCharts();
    $('extrapolationNote').hidden=!data.extrapolated;
    drawRegionPanel(parameters);
    return data;
  }catch(err){if(seq!==requestNumber)return;showCalculationError(err.message);drawRegionPanel(parameters);}
  finally{if(seq===requestNumber)$('apply').disabled=false;}
}
function renderChecks(){
  $('checks').replaceChildren();for(const c of mission.checks){
    const row=document.createElement('div');row.className='constraint'+(c.ok?'':' bad');
    const head=document.createElement('div');head.className='constraint-head';
    const name=document.createElement('span');name.textContent=(c.applicable===false?'— ':c.ok?'✓ ':'× ')+c.name;
    const value=document.createElement('span');value.textContent=c.applicable===false?'不适用 · 不占用':`${c.used.toFixed(2)} / ${c.limit.toFixed(2)} ${c.unit}`;
    head.append(name,value);const track=document.createElement('div');track.className='track';const fill=document.createElement('div');fill.style.width=`${c.limit>0?Math.min(100,c.used/c.limit*100):c.used>0?100:0}%`;track.append(fill);row.append(head,track);$('checks').append(row);
  }
}
function renderPhases(){
  $('phases').replaceChildren();mission.segments.forEach((s,i)=>{const b=document.createElement('button');b.textContent=s.name;b.onclick=()=>{setPlaying(false);t=s.start;render();};b.dataset.index=i;$('phases').append(b);});
}
function current(){
  if(!mission?.valid)return null;
  const i=mission.segments.findIndex(s=>t<s.end-1e-9), index=i<0?mission.segments.length-1:i;
  const s=mission.segments[index], f=Math.max(0,Math.min(1,(t-s.start)/(s.end-s.start)));
  const value=k=>s[k+'0']+(s[k+'1']-s[k+'0'])*f;
  return {s,index,f,mass:value('m'),energy:value('e'),distance:value('s')};
}
function clock(minutes){const seconds=Math.round(minutes*60);return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;}
function point(distance){const p=mission.parameters,first=distance<=p.distance_ac;const ratio=first?distance/p.distance_ac:(distance-p.distance_ac)/p.distance_cb;return first?[110+370*ratio,285-120*ratio]:[480+370*ratio,165+120*ratio];}
function render(){
  const state=current();if(!state){$('fifoOverlay').style.display='none';$('phase').textContent='等待有效方案';$('clock').textContent='—';for(const id of ['mass','speed','distance','energy','liveSaving'])$(id).textContent='—';if(!mission)for(const id of ['savingRate','gammaValue','cbComparison','savedTotal'])$(id).textContent='—';$('trail').setAttribute('d','');$('drone').setAttribute('transform','translate(110 285) rotate(-18)');$('formation').style.display='none';$('cargo').style.display='none';return;}
  const {s,index,f,mass,energy,distance}=state,p=mission.parameters,done=t>=mission.total_time-1e-9;
  const phaseText=done?'任务完成 · 已抵达 B':s.name;
  if($('phase').textContent!==phaseText)$('phase').textContent=phaseText;
  $('clock').textContent=`${clock(t)} / ${clock(mission.total_time)}`;
  $('mass').textContent=`${mass.toFixed(2)} kg`;$('speed').textContent=`${!done&&['ac','cb'].includes(s.key)?p.speed:0} km/h`;
  $('distance').textContent=`${distance.toFixed(2)} km`;
  const queueElapsed=fifoState?Math.max(0,Math.min(fifoState.target.wait,t-mission.arrival)):0;
  const loiterEnergy=fifoState&&fifoState.target.wait>0?queueElapsed*fifoState.waitEnergy/fifoState.target.wait:0;
  $('energy').textContent=`${(energy+loiterEnergy).toFixed(3)} kWh${fifoState?'（含估计盘旋）':''}`;
  const cbProgress=Math.max(0,Math.min(1,(t-mission.departure)/(mission.total_time-mission.departure)));
  $('liveSaving').textContent=`${(cbProgress*mission.formation.saving).toFixed(3)} kWh`;
  $('seek').value=t/mission.total_time*1000;
  [...$('phases').children].forEach((b,i)=>b.classList.toggle('active',i===index));
  const [x,y]=point(distance),angle=s.key==='ac'?-18:s.key==='cb'?18:0;
  $('drone').setAttribute('transform',`translate(${x} ${y}) rotate(${angle})`);
  $('trail').setAttribute('d',distance<=p.distance_ac?`M110 285L${x} ${y}`:`M110 285L480 165L${x} ${y}`);
  const inFormation=['join','cb'].includes(s.key)&&p.formation_role!==0&&p.formation_size>1;
  $('formation').style.display=inFormation?'':'none';
  if(inFormation){const r=s.key==='join'?f:1;[...$('formation').children].forEach((mate,i)=>{const row=Math.floor(i/2)+1,sign=i%2?-1:1;const dx=p.formation_role===3?-32*row:(i===0?38:-32*row);mate.setAttribute('transform',`translate(${x+dx*r} ${y+sign*24*row*r}) rotate(18)`);});}
  const cablePhase=['lower','unload','load','raise'].includes(s.key);$('cargo').style.display=cablePhase?'':'none';
  if(cablePhase){const ext=s.key==='lower'?f:s.key==='raise'?1-f:1;const bottom=y+22+70*ext;$('cable').setAttribute('x1',x);$('cable').setAttribute('x2',x);$('cable').setAttribute('y1',y+10);$('cable').setAttribute('y2',bottom);$('box').setAttribute('x',x-10);$('box').setAttribute('y',bottom);$('cargoLabel').textContent=`仓内 ${Math.max(0,mass-p.q).toFixed(2)} kg`;}
  renderFifoQueue(s.key);
  for(const svg of [$('massChart'),$('energyChart')]){const w=svg.clientWidth,xg=43+(w-58)*t/mission.total_time;svg.querySelectorAll('.chart-guide').forEach(el=>{el.setAttribute('x1',xg);el.setAttribute('x2',xg);});}
}
function renderFifoQueue(stage){
  const overlay=$('fifoOverlay');if(!fifoState){overlay.style.display='none';return}
  overlay.style.display='';
  const now=fifoState.target.arrival+t-mission.arrival;
  const waiting=fifoState.rows.filter(r=>r.arrival<=now && (r.departure===null||r.departure>now))
    .sort((a,b)=>(a.departure??Infinity)-(b.departure??Infinity)||(a.seat??Infinity)-(b.seat??Infinity));
  const departing=fifoState.rows.filter(r=>r.departure!==null && now>=r.departure && now<r.departure+.6);
  const next=fifoState.departures.find(d=>d>=now);
  $('fifoClock').textContent=`C 点时钟 ${clock(Math.max(0,now))} · ${next===undefined?'无后续班次':`下一班 ${clock(next)}`}`;
  $('fifoQueueLabel').textContent=`排队 ${waiting.length} 架${stage==='wait'?' · 目标正在等待':stage==='join'?' · 目标准备入编':['lower','unload','load','raise','approach','drop','exchange','pickup','exit'].includes(stage)?' · 目标索降作业':''}`;
  const layer=$('fifoPlanes');layer.replaceChildren();
  waiting.slice(0,7).forEach((r,i)=>{
    const approach=Math.max(0,Math.min(1,(now-r.arrival)/.35));
    const x=555+approach*(45+i*45),y=103;
    const g=element(layer,'g',{transform:`translate(${x} ${y}) scale(.57)`,color:r.index===fifoState.target.index?'#bc7b17':'#518772'});
    element(g,'use',{href:'#plane'});element(layer,'text',{x:x-9,y:136,class:'map-small'},`F${r.index+1}`);
  });
  departing.forEach(r=>{
    const f=(now-r.departure)/.6,x=600+300*f,y=103-60*f;
    const g=element(layer,'g',{transform:`translate(${x} ${y}) scale(.57)`,color:r.index===fifoState.target.index?'#bc7b17':'#518772'});
    element(g,'use',{href:'#plane'});
  });
}
const NS='http://www.w3.org/2000/svg';
function element(svg,tag,attrs,text){const e=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;svg.append(e);return e;}
function drawCharts(){
  for(const [id,key,title,unit,color] of [['massChart','mass','任务货物','kg',''],['energyChart','energy','累计新增耗能','kWh','chart-energy']]){
    const svg=$(id);svg.replaceChildren();if(!mission?.valid)continue;
    const w=svg.clientWidth||400,h=158;svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
    const samples=mission.samples,max=Math.max(...samples.map(s=>key==='energy'?s.energy_solo:s[key]),.01)*1.15;
    const x=v=>43+(w-58)*v/mission.total_time,y=v=>122-87*v/max;
    element(svg,'text',{x:5,y:16,class:'chart-label'},`${title} / ${unit}`);
    for(let i=0;i<3;i++){const value=max*i/2,yy=y(value);element(svg,'line',{x1:43,x2:w-15,y1:yy,y2:yy,stroke:'#e6ede8'});element(svg,'text',{x:38,y:yy+4,'text-anchor':'end',class:'chart-label'},value.toFixed(key==='energy'?2:1));}
    for(let i=0;i<4;i++){const v=mission.total_time*i/3;element(svg,'text',{x:x(v),y:142,'text-anchor':i===0?'start':i===3?'end':'middle',class:'chart-label'},`${v.toFixed(1)} min`);}
    element(svg,'path',{d:samples.map((s,i)=>`${i?'L':'M'}${x(s.time)},${y(s[key])}`).join(' '),class:'chart-line '+color});
    if(key==='energy')element(svg,'path',{d:samples.map((s,i)=>`${i?'L':'M'}${x(s.time)},${y(s.energy_solo)}`).join(' '),fill:'none',stroke:'#6d879c','stroke-width':2,'stroke-dasharray':'5 4'});
    element(svg,'line',{x1:x(t),x2:x(t),y1:27,y2:122,class:'chart-guide'});
  }
}
const studyPanels=setupPanels(()=>mission?.parameters||DEFAULTS);
function drawRegionPanel(main){studyPanels.updateRegions(main);}
function fifoTimes(id){
  const raw=$(id).value.trim().split(/[,，\s]+/);
  if(raw.length>48||raw.some(x=>x===''||!Number.isFinite(Number(x))||Number(x)<0))throw new Error('请填写不超过 48 个非负时刻，以逗号分隔');
  return raw.map(Number);
}
async function runFifo(){
  const button=$('runFifo');button.disabled=true;$('fifoStatus').textContent='正在计算…';
  $('fifoRows').replaceChildren();$('fifoScenarios').replaceChildren();
  try{
    if(!validateInputs())throw new Error('先修正主模型参数');
    const arrivals=fifoTimes('fifoArrivals'), departures=fifoTimes('fifoDepartures');
    const seats=Number($('fifoSeats').value),baseline=assignFifo(arrivals,departures,seats);
    const targetIndex=2,initial=baseline[targetIndex];if(!initial||initial.wait===null)throw new Error('第 3 架目标飞机没有可用的后续编队，请增加发车班次');
    const p=formParameters(),cargo_types=Object.fromEntries(cargoGroups.map(([g])=>[g,$('cargoType_'+g).value]));
    const candidates=$('fifoDefer').checked?departures.filter(d=>d>=initial.departure):[initial.departure];
    function choose(eta){
      let best=null;
      for(const earliest of candidates){
        const rows=assignWithDeferral(arrivals,departures,seats,targetIndex,earliest),target=rows[targetIndex];
        if(target.wait===null||target.wait<p.join_buffer)continue;
        const waitEnergy=target.wait*p.cruise_empty*p.speed/60;
        if(waitEnergy>p.G)continue;
        const result=simulateModel({parameters:{...p,W:target.wait-p.join_buffer,G:p.G-waitEnergy,eta},cargo_types,mode:'optimal'});
        if(!result.valid)continue;
        const score=result.economics.transfer_net_benefit-p.energy_price*waitEnergy;
        if(!best||score>best.score+1e-9||(Math.abs(score-best.score)<=1e-9&&target.departure<best.target.departure))best={rows,target,waitEnergy,result,score,eta};
      }
      return best;
    }
    const scenarios=[.05,.10,.15].map(eta=>choose(eta));
    const active=scenarios.find(x=>x&&Math.abs(x.eta-p.eta)<1e-12)||choose(p.eta);
    if(!active)throw new Error('现有班次、入编缓冲与电量余量下，目标飞机无法形成可行方案');
    const {rows,target,waitEnergy}=active;
    const interval=departures.length>1?(departures.at(-1)-departures[0])/(departures.length-1):null;
    const served=rows.filter(x=>x.wait!==null), observed=served.reduce((a,x)=>a+x.wait,0)/served.length;
    const horizon=departures.at(-1)-Math.min(...arrivals);
    const approximation=interval&&horizon>0?averageWaitApprox(arrivals.length/horizon,interval,seats):null;
    for(const r of rows){const tr=document.createElement('tr');for(const value of [r.index===2?`目标 F${r.index+1}`:`F${r.index+1}`,r.arrival,r.departure??'无空位',r.seat??'—',r.wait===null?'—':`${r.wait.toFixed(1)} min`]){const td=document.createElement('td');td.textContent=value;tr.append(td)}$('fifoRows').append(tr)}
    for(let i=0;i<scenarios.length;i++){
      const item=scenarios[i],eta=[.05,.10,.15][i];
      const tr=document.createElement('tr');
      const values=item?[`${(eta*100).toFixed(0)}%`,`${item.target.departure} min / 等 ${item.target.wait} min`,`${((1-item.result.formation.gamma)*100).toFixed(1)}%`,`${item.result.d.toFixed(2)} kg`,`${item.result.l.toFixed(2)} kg`,`${item.result.operation_time.toFixed(2)} min`,`${item.result.economic_optimal_profit.toFixed(2)}`,`${item.waitEnergy.toFixed(3)} kWh`,`${item.score.toFixed(2)}`]:[`${(eta*100).toFixed(0)}%`,'无可行班次','—','—','—','—','—','—','—'];
      for(const value of values){const td=document.createElement('td');td.textContent=value;tr.append(td)}
      $('fifoScenarios').append(tr);
    }
    const applied=await calculate({parameters:{W:target.wait-p.join_buffer,G:p.G-waitEnergy,eta:p.eta},mode:'optimal',precomputed:active.result,
      fifoState:{rows,target,departures,waitEnergy}});
    if(!applied)throw new Error('选中情景未能接入主动画');
    $('fifoStatus').textContent=`当前 η=${(p.eta*100).toFixed(0)}% 选第 ${target.batch+1} 班（${target.departure} min 发车），实际等待 ${target.wait.toFixed(1)} min，可作业 ${(target.wait-p.join_buffer).toFixed(1)} min。${target.departure>initial.departure?`相对首个可搭班次 ${initial.departure} min 主动延后；其他飞机重新排位。`:'未延后。'}样本平均等待 ${observed.toFixed(2)} min；v2.4 单位泊松近似 ${approximation?.wait===null?'不稳定/不可用':approximation?approximation.wait.toFixed(2)+' min':'无法估计'}。主动画已同步，正从 C 点开始播放排队。`;
    t=mission.arrival;render();setPlaying(true);
  }catch(error){$('fifoStatus').textContent=`算例无法计算：${error.message}`}finally{button.disabled=false}
}
$('runFifo').onclick=runFifo;
$('form').noValidate=true;
$('form').addEventListener('submit',e=>{e.preventDefault();calculate();});
$('form').addEventListener('input',()=>{$('dirty').hidden=false;});
$('sharedAirspace').addEventListener('change',updateAirspaceInputs);
document.querySelectorAll('[name="mode"]').forEach(el=>el.addEventListener('change',()=>{document.querySelector('.manual').hidden=el.value!=='manual';}));
$('reset').onclick=()=>{fillDefaults();calculate();};
$('play').onclick=()=>{if(!mission?.valid)return;if(t>=mission.total_time)t=0;setPlaying(!playing);};
$('restart').onclick=()=>{setPlaying(false);t=0;render();};
$('next').onclick=()=>{setPlaying(false);t=Math.min(mission.total_time,mission.segments.find(s=>s.end>t+1e-8)?.end||mission.total_time);render();};
$('seek').oninput=()=>{setPlaying(false);t=Number($('seek').value)/1000*mission.total_time;render();};
$('export').onclick=()=>{if(!mission?.valid)return;const url=URL.createObjectURL(new Blob([exportCsv(mission)],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='drone-simulation.csv';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);};
new ResizeObserver(()=>{drawCharts();render();}).observe($('massChart'));
function frame(now){if(playing&&mission?.valid){t=Math.min(mission.total_time,t+(now-lastFrame)/1000*Number($('rate').value)/60);if(t>=mission.total_time)setPlaying(false);render();}lastFrame=now;requestAnimationFrame(frame);}
requestAnimationFrame(frame);
defaults={...DEFAULTS,cargo_profiles:CARGO_PROFILES};fillDefaults();
for(const [id,key] of [['r_formation_size','formation_size'],['r_eta','eta'],['r_chi','propulsion_share'],['r_energy_price','energy_price'],['r_time_value','time_value']])$(id).value=DEFAULTS[key];
$('r_role').value=String(DEFAULTS.formation_role);
$('r_delay').value=(DEFAULTS.W+DEFAULTS.join_buffer).toFixed(1);calculate();
// Parent accepts messages only from this frame and this origin.
let sentHeight=0;
new ResizeObserver(()=>{const height=Math.ceil(document.body.getBoundingClientRect().height)+24;if(height!==sentHeight){sentHeight=height;parent.postMessage({type:'drone-logistics-height',height},location.origin);}}).observe(document.body);
