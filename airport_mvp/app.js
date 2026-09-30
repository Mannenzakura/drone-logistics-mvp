const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fields = [
  ['airspace_per_min','共享空域容量 / 次·min⁻¹'],['pads','机场起降位 / 个'],['outside_bays','机场外作业位 / 个'],
  ['cargo_teams','货运处理团队 / 组'],['cargo_rate_kg_min','每组货运速度 / kg·min⁻¹'],
  ['hold_kwh_min','空中排队耗电 / kWh·min⁻¹'],['outside_kwh_min','场外作业耗电 / kWh·min⁻¹'],
  ['electricity_yuan_kwh','电价 / 元·kWh⁻¹'],['handling_yuan_kg','处理成本 / 元·kg⁻¹'],
  ['delay_yuan_min','迟到罚金 / 元·min⁻¹'],
  ['day_fixed_yuan_hour','昼间固定运营成本 / 元·h⁻¹'],
  ['night_fixed_yuan_hour','夜间固定运营成本 / 元·h⁻¹'],
  ['maintenance_yuan_hour','持续维护成本 / 元·h⁻¹'],['pad_repair_yuan','每次停机位故障维修费 / 元'],
  ['random_seed','突发事件随机种子'],['incident_probability_hour','每小时突发事件概率 / 0—1'],
  ['horizon_min','仿真上限 / min']
  ,['night_depart_min','夜间调拨发车 / min'],['night_aircraft_at_airport','备用飞机 / 架'],
  ['night_target_transfer','调拨目标 / 架'],['night_trucks','调拨卡车 / 辆'],
  ['night_truck_capacity','每车载机 / 架'],['night_trip_min','单程车时 / min'],
  ['night_turnaround_min','装卸周转 / min'],['night_truck_cost_yuan','每趟卡车成本 / 元']
];
let defaults, applied, result, minute = 0, visualMinute = 0, transitionFrom = 0, transitionStart = 0, playing = false, selected = null, frame = 0, lastFrame = 0, lastPaint = 0, airport3d = null, viewMode = '2d', detail = null, gameMode = false, liveNotice = '', sessionId = null, stepping = false, nextTick = 0;
let lastResultsSignature='',lastCardsSignature='',scenarioParams=null;
const fmt = n => n == null ? '—' : n;
const clock = t => `${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}:${String(Math.floor((t%1)*60)).padStart(2,'0')}`;
const between = (a,b,x) => Math.max(0,Math.min(1,(x-a)/(b-a)));
const lerp = (a,b,r) => a+(b-a)*r;

function inputRow(f) {
  const tr=document.createElement('tr');
  tr.innerHTML=`<td><input data-k="id" value="${esc(f.id)}"></td><td><input type="number" data-k="arrival" value="${f.arrival}"></td><td><select data-k="mode"><option value="land">起降</option><option value="outside">机场外作业</option></select></td><td><input type="number" data-k="unload_kg" value="${f.unload_kg}"></td><td><input type="number" data-k="load_kg" value="${f.load_kg}"></td><td><input type="number" data-k="deadline" value="${f.deadline}"></td><td><input type="number" data-k="fee_yuan_kg" value="${f.fee_yuan_kg}"></td><td><button type="button">删</button></td>`;
  tr.querySelector('select').value=f.mode;
  tr.querySelector('button').onclick=()=>{tr.remove();$('flightTableSummary').textContent=`展开逐架编辑（${$('inputRows').children.length} 架）`};
  $('inputRows').append(tr);
  $('flightTableSummary').textContent=`展开逐架编辑（${$('inputRows').children.length} 架）`;
}
function showInputs(p) {
  $('fields').innerHTML=fields.map(([key,label])=>`<label>${label}<input id="f_${key}" type="number" step="any" value="${p[key]}"></label>`).join('');
  $('shared').checked=p.outside_uses_shared_airspace;
  $('nightEnabled').checked=p.night_truck_enabled;
  $('randomEvents').checked=p.random_events_enabled;
  $('inputRows').innerHTML='';p.flights.forEach(inputRow);
  $('planCount').value=p.flights.length;
  $('planUnload').value=(p.flights.reduce((n,f)=>n+f.unload_kg,0)/p.flights.length).toFixed(1);
  $('planLoad').value=(p.flights.reduce((n,f)=>n+f.load_kg,0)/p.flights.length).toFixed(1);
}
function collect() {
  const p={};
  for (const [key] of fields) {const el=$('f_'+key);if(el.value.trim()==='')throw Error(key+'不能为空');p[key]=Number(el.value)}
  p.outside_uses_shared_airspace=$('shared').checked;
  p.night_truck_enabled=$('nightEnabled').checked;
  p.random_events_enabled=$('randomEvents').checked;
  p.flights=[...$('inputRows').children].map(tr=>{const f={};tr.querySelectorAll('[data-k]').forEach(el=>{if(el.value.trim()==='')throw Error(el.dataset.k+'不能为空');f[el.dataset.k]=['id','mode'].includes(el.dataset.k)?el.value:Number(el.value)});return f});
  return p;
}
function assignSlots() {
  for (const mode of ['land','outside']) {
    const end=[];
    result.flights.filter(f=>f.mode===mode&&f.enter!=null).sort((a,b)=>a.enter-b.enter||a.id.localeCompare(b.id)).forEach(f=>{
      let slot=end.findIndex(x=>x<=f.enter);if(slot<0)slot=end.length;
      end[slot]=f.exit==null?Infinity:f.exit;f.slot=slot;
    });
  }
}
function endTime(){return applied?.horizon_min||1}
function status(f,t) {
  if(t<f.arrival)return ['未到达','future'];
  if(f.enter==null||t<f.enter)return ['等待空域 / 作业位','queued'];
  if(f.service_start==null||t<f.service_start)return ['等待货运处理','queued'];
  if(f.service_end==null||t<f.service_end)return ['货运处理中','active'];
  if(f.exit==null||t<f.exit)return ['等待离开','queued'];
  return [f.late_min>0?'已离开 · 迟到':'已离开 · 准时',f.late_min>0?'late':'done'];
}
const padPoints=[[603,414],[777,354],[700,479],[870,414],[535,458],[790,461]];
const outsidePoints=[[205,527],[267,555],[143,555]];
function pointFor(f){
  const points=f.mode==='land'?padPoints:outsidePoints;
  return points[f.slot%points.length];
}
function curve(a,b,c,r){
  return [(1-r)*(1-r)*a[0]+2*(1-r)*r*b[0]+r*r*c[0],
          (1-r)*(1-r)*a[1]+2*(1-r)*r*b[1]+r*r*c[1]];
}
function pos(f,t,queueIndex) {
  const start=[130+(queueIndex%3)*32,155+Math.floor(queueIndex/3)*26];
  if(f.enter==null)return start;
  const target=pointFor(f);
  if(t<f.enter){
    const approach=Math.max(f.arrival,f.enter-0.85);
    if(t<approach)return start;
    const control=f.mode==='land'?[345,95]:[115,319];
    return curve(start,control,target,between(approach,f.enter,t));
  }
  if(f.exit!=null&&t>=f.exit){
    return curve(target,[920,75],[1045,130],between(f.exit,f.exit+0.9,t));
  }
  return target;
}
function drawSlots(mode,holder,capacity,t) {
  const points=mode==='land'?padPoints:outsidePoints;
  const occupied=result.flights.filter(f=>f.mode===mode&&f.enter!=null&&f.enter<=t&&(f.exit==null||t<f.exit)).map(f=>f.slot);
  const visible=Math.min(capacity,points.length);
  $(holder).innerHTML=Array.from({length:visible},(_,i)=>{
    const [x,y]=points[i];
    return `<g data-zone="${mode==='land'?'pad':'outside'}" data-slot="${i}" class="zone-hotspot"><ellipse class="stand-shadow" cx="${x+5}" cy="${y+9}" rx="48" ry="30"/><ellipse class="stand ${mode==='outside'?'outside':''} ${occupied.includes(i)?'busy':''}" cx="${x}" cy="${y}" rx="47" ry="28"/><path d="M${x-14} ${y-10}v20m28-20v20m-28-10h28" class="stand-h"/><text class="stand-number" x="${x}" y="${y+48}">${mode==='land'?'停机位':'索降位'} ${i+1}</text></g>`;
  }).join('')+(capacity>points.length?`<text class="scene-small" x="${mode==='land'?505:120}" y="${mode==='land'?538:600}">另有 ${capacity-points.length} 个位置未绘出</text>`:'');
}
function paintScene(t) {
  const inQueue=result.flights.filter(f=>f.arrival<=t&&(f.enter==null||t<f.enter));
  drawSlots('land','padSlots',applied.pads,t);
  drawSlots('outside','outsideSlots',applied.outside_bays,t);
  const active=result.flights.filter(f=>f.arrival<=t&&(f.exit==null||t<f.exit+0.85));
  $('planes').innerHTML=active.map(f=>{
    const i=inQueue.indexOf(f),[x,y]=pos(f,t,Math.max(0,i));
    const color=f.mode==='land'?'#176a54':'#bd8a35';
    return `<g class="plane-mark ${selected===f.id?'selected':''}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})" data-id="${esc(f.id)}"><ellipse cy="18" rx="30" ry="10" fill="#486b60" opacity=".22"/><path d="M-20 -14L20 14M20 -14L-20 14" stroke="${color}" stroke-width="7" stroke-linecap="round"/><circle cx="-22" cy="-16" r="10" fill="#edf5f0" stroke="${color}" stroke-width="4"/><circle cx="22" cy="-16" r="10" fill="#edf5f0" stroke="${color}" stroke-width="4"/><circle cx="-22" cy="16" r="10" fill="#edf5f0" stroke="${color}" stroke-width="4"/><circle cx="22" cy="16" r="10" fill="#edf5f0" stroke="${color}" stroke-width="4"/><path d="M-13 0Q0 -19 13 0Q0 21 -13 0" fill="${color}" stroke="white" stroke-width="2"/><text class="drone-id" y="4">${esc(f.id.slice(0,4))}</text></g>`;
  }).join('');
  $('planes').querySelectorAll('[data-id]').forEach(el=>el.onclick=()=>{selected=el.dataset.id;paint()});
  const processing=result.flights.filter(f=>f.service_start!=null&&f.service_start<=t&&(f.service_end==null||t<f.service_end));
  $('cargoIcons').innerHTML=processing.slice(0,10).map((f,i)=>{
    const r=between(f.service_start,f.service_end,t),x=688+135*r,y=520+(i%3)*14;
    return `<g><rect class="cargo-icon" x="${x.toFixed(1)}" y="${y}" width="20" height="16" rx="2"/><path d="M${(x+10).toFixed(1)} ${y}v16" stroke="#fff4dc"/><text class="cargo-id" x="${(x+24).toFixed(1)}" y="${y+12}">${esc(f.id)}</text></g>`;
  }).join('');
}
function paintCards(t) {
  let visible=result.flights.filter(f=>f.id===selected||f.arrival<=t&&(f.exit==null||f.exit>=t-30)||f.arrival>t&&f.arrival<=t+60);
  if(visible.length<3)visible=[...new Set([...visible,...result.flights.filter(f=>f.arrival>t).slice(0,3)])];
  visible=visible.slice(0,24);
  const signature=visible.map(f=>`${f.id}/${status(f,t)[0]}/${f.service_start}/${f.exit}`).join('|')+'@'+selected;
  if(signature!==lastCardsSignature){
  lastCardsSignature=signature;
  $('flightCards').innerHTML=`<p class="hint list-note">显示当前、近期和下一批 ${visible.length} 架；完整 ${result.flights.length} 架见下方清单。</p>`+visible.map(f=>{
    const [label,kind]=status(f,t);
    return `<button class="flight-card ${selected===f.id?'selected':''}" data-id="${esc(f.id)}"><b>${esc(f.id)} · ${f.mode==='land'?'起降':'机场外'}</b><span>到达 ${f.arrival} min · 卸 ${f.unload_kg} / 装 ${f.load_kg} kg</span><br><span class="status ${kind}">${label}</span></button>`;
  }).join('');
  $('flightCards').querySelectorAll('[data-id]').forEach(el=>el.onclick=()=>{selected=el.dataset.id;paint()});
  }
  const f=result.flights.find(x=>x.id===selected);
  $('selection').textContent=f?`${f.id}：到达 ${f.arrival}，进入 ${fmt(f.enter)}，货运 ${fmt(f.service_start)}—${fmt(f.service_end)}，离开 ${fmt(f.exit)}；空中排队 ${fmt(f.air_wait_min)} 分钟，货运排队 ${fmt(f.cargo_wait_min)} 分钟，迟到 ${fmt(f.late_min)} 分钟。`:'选择飞机查看详细状态。';
}
function paintCapacity(t) {
  const row=result.timeline[Math.min(Math.floor(t),result.timeline.length-1)];
  const figures=[['共享空域动作',row.airspace_used,applied.airspace_per_min],['起降位',row.pads_used,applied.pads],['机场外作业位',row.outside_used,applied.outside_bays],['货运团队',row.cargo_teams_used,applied.cargo_teams]];
  $('capacityBars').innerHTML=figures.map(([name,use,cap])=>`<div class="capacity-line"><div class="capacity-label"><span>${name}</span><b>${use} / ${cap}</b></div><div class="track"><div class="fill ${use>=cap?'warn':''}" style="width:${cap?Math.min(100,100*use/cap):0}%"></div></div>${use>cap?'<small>故障后现有任务继续，暂停分配新任务</small>':''}</div>`).join('');
  const eventText=(row.events||[]).map(e=>esc(e.text)).join('<br>')||'无新事件';
  $('eventLog').innerHTML=`<b>第 ${row.minute} 分钟 · 离散事件</b>${liveNotice?`<br><em>${esc(liveNotice)}</em>`:''}<br>${eventText}<br><span>待入场 ${row.air_queue} 架 · 待货运 ${row.cargo_queue} 架 · 本分钟处理 ${row.cargo_processed_kg} kg</span>`;
  const hour=(t%1440)/60,rate=hour>=6&&hour<22?applied.day_fixed_yuan_hour:applied.night_fixed_yuan_hour;
  $('liveStats').innerHTML=[['待进入',row.air_queue+' 架'],['占用机位',row.pads_used+' / '+applied.pads],['场外作业',row.outside_used+' / '+applied.outside_bays],['货运处理中',row.cargo_teams_used+' / '+applied.cargo_teams],['已离开',result.flights.filter(f=>f.exit!=null&&f.exit<=t).length+' / '+result.flights.length],['本分钟处理',row.cargo_processed_kg+' kg'],['到达未处理',row.cargo_pending_kg+' kg'],['当前固定费率','¥ '+rate+' / h'],['累计固定成本','¥ '+result.metrics.operating_cost_yuan.toFixed(2)],['累计维护费','¥ '+result.metrics.maintenance_cost_yuan.toFixed(2)],['累计维修费','¥ '+result.metrics.repair_cost_yuan.toFixed(2)],['夜间在途',result.night.in_transit+' 架'],['外部基地',result.night.destination_aircraft+' 架']].map(([name,value])=>`<div class="stage-stat"><span>${name}</span><strong>${value}</strong></div>`).join('');
}
function paint() {
  if(!result)return;
  minute=Math.max(0,Math.min(endTime(),minute));
  paintVisual();paintCards(minute);paintCapacity(minute);paintOperations(minute);paintDetail(minute);paintGameHud(minute);
}
function paintOperations(t){
  const m=result.metrics,row=result.timeline[Math.min(Math.floor(t),result.timeline.length-1)]||{};
  const active=result.flights.filter(f=>f.service_start!=null&&f.service_start<=t&&(f.service_end==null||t<f.service_end));
  $('cargoStatus').innerHTML=`<div class="operation-numbers"><div><span>本分钟装卸</span><strong>${row.cargo_processed_kg||0} kg</strong></div><div><span>累计装卸</span><strong>${m.cargo_handled_kg} / ${m.cargo_planned_kg} kg</strong></div><div><span>到达未处理</span><strong>${m.cargo_pending_kg} kg</strong></div><div><span>货运排队</span><strong>${row.cargo_queue||0} 架</strong></div></div><div class="operation-list"><b>正在处理</b>${active.length?active.map(f=>`<div>${esc(f.id)}<span>卸 ${f.unload_kg} / 装 ${f.load_kg} kg · ${Math.min(f.unload_kg+f.load_kg,Math.max(0,t-f.service_start)*applied.cargo_rate_kg_min)} kg 已处理</span></div>`).join(''):'<p>当前没有货运任务</p>'}</div><p class="hint">装卸量是处理工作量；同一批货物先卸后装可能计算两次。</p>`;
  const n=result.night,next=applied.night_truck_enabled&&t<applied.night_depart_min?applied.night_depart_min:null;
  $('nightStatus').innerHTML=`<div class="operation-numbers"><div><span>机场备用飞机</span><strong>${n.airport_aircraft} 架</strong></div><div><span>卡车在途</span><strong>${n.in_transit} 架</strong></div><div><span>外部基地已到</span><strong>${n.destination_aircraft} / ${applied.night_target_transfer} 架</strong></div><div><span>累计卡车费用</span><strong>¥ ${n.cost_yuan.toFixed(2)}</strong></div></div><div class="operation-list"><b>转运任务</b>${n.trips.length?n.trips.map(trip=>`<div>卡车 ${trip.truck+1} · ${trip.aircraft} 架<span>${trip.depart} → ${trip.arrive} min · ${trip.state==='road'?'在途':'已送达'}</span></div>`).join(''):`<p>${applied.night_truck_enabled?(next==null?'等待可用车辆与库存':'计划第 '+next+' 分钟开始调拨'):'夜间调拨已关闭'}</p>`}</div><p class="hint">仅调拨预置备用飞机，尚未与逐架日间航班绑定。</p>`;
  const incident=(result.incidents||[]).find(x=>x.status==='active');
  const history=(result.incidents||[]).slice(-3).reverse().map(x=>`${esc(x.label)} ${x.start_min}—${x.end_min} min · ${x.status==='active'?'进行中':'已恢复'}`).join('；');
  $('incidentBanner').innerHTML=(incident?`<strong>突发事件 · ${esc(incident.label)}</strong><span>第 ${incident.start_min}—${incident.end_min} 分钟 · ${esc(incident.resource)} 当前 ${applied[incident.resource]}</span>`:`<strong>当前无突发事件</strong><span>${applied.random_events_enabled?'按固定随机种子自动抽样；已发生 '+(result.incidents?.length||0)+' 起':'自动突发事件已关闭'}</span>`)+(history?`<small>最近事件：${history}</small>`:'');
}
function paintVisual(){
  if(!result)return;
  $('clock').textContent=`${clock(visualMinute)} / ${clock(endTime())}`;
  $('seek').value=visualMinute.toFixed(2);
  if(viewMode==='2d')paintScene(visualMinute);
  airport3d?.setMinute(visualMinute,selected);
  if($('gameTime'))$('gameTime').textContent=clock(visualMinute);
}
function paintGameHud(t){
  if(!result||!$('gameScore'))return;
  const departed=result.flights.filter(f=>f.exit!=null&&f.exit<=t);
  const onTime=departed.filter(f=>!f.late_min).length;
  const events=result.timeline[Math.min(Math.floor(t),result.timeline.length-1)];
  const money=liveEconomics(t);
  $('gameScore').textContent=`¥ ${money.net.toFixed(2)}`;
  $('gameScoreNote').textContent=`收入 ¥${money.revenue.toFixed(2)} · 成本 ¥${money.cost.toFixed(2)}`;
  $('gameTime').textContent=clock(t);
  $('gameMission').textContent=`航班 ${departed.length}/${result.flights.length} · 货运 ${result.metrics.cargo_handled_kg}/${result.metrics.cargo_planned_kg} kg`;
  $('gameProgress').style.width=`${100*departed.length/result.flights.length}%`;
  const liveEvents=(events.events||[]).slice(-5).map(e=>esc(e.text)).join('<br>')||'等待下一事件';
  $('gameEvents').innerHTML=`<b>第 ${events.minute} 分钟 · 实时事件流</b>${liveNotice?`<br><em>${esc(liveNotice)}</em>`:''}<br>${liveEvents}<br><small>空域 ${events.airspace_used} · 停机位 ${events.pads_used} · 货运团队 ${events.cargo_teams_used}</small>`;

  const incident=(result.incidents||[]).find(x=>x.status==='active');
  $('gameIncident').textContent=incident?`突发事件：${incident.label} · 预计第 ${incident.end_min} 分钟恢复`:`随机事件自动抽样 · 已发生 ${result.incidents?.length||0} 起`;
}
function liveEconomics(t){
  let revenue=0,cost=0;
  for(const f of result.flights){
    const cargo=f.unload_kg+f.load_kg;
    const handled=f.service_start==null?0:Math.min(cargo,Math.max(0,t-f.service_start)*applied.cargo_rate_kg_min);
    revenue+=handled*f.fee_yuan_kg;
    cost+=handled*applied.handling_yuan_kg;
    const airEnd=f.enter==null?t:Math.min(t,f.enter);
    cost+=Math.max(0,airEnd-f.arrival)*applied.hold_kwh_min*applied.electricity_yuan_kwh;
    if(f.mode==='outside'&&f.enter!=null)cost+=Math.max(0,Math.min(t,f.exit??t)-f.enter)*applied.outside_kwh_min*applied.electricity_yuan_kwh;
    cost+=Math.max(0,Math.min(t,f.exit??t)-f.deadline)*applied.delay_yuan_min;
  }
  cost+=(result.night?.cost_yuan||0)+(result.metrics?.operating_cost_yuan||0)+(result.metrics?.maintenance_cost_yuan||0)+(result.metrics?.repair_cost_yuan||0);
  return {revenue,cost,net:revenue-cost};
}
function gameHudMarkup(){return `<div id="gameHUD" class="game-hud" aria-label="实时动态视图操作界面"><div class="game-hud-top"><div class="game-hud-card"><span>LIVE NET · 过程净收益</span><strong id="gameScore">¥ 0.00</strong><small id="gameScoreNote">收入 ¥0.00 · 成本 ¥0.00</small></div><div class="game-hud-card"><span>SIM TIME</span><strong id="gameTime">00:00</strong><small>空格播放 / 暂停</small></div></div><div class="game-hud-card game-mission"><span>MISSION 01 · 机场运营</span><b id="gameMission">完成航班的地面周转</b><div class="game-progress"><i id="gameProgress"></i></div><small>随作业进度估算；最终以排程结果为准。</small></div><div id="gameEvents" class="game-events">等待调度事件</div><div id="gameIncident" class="game-incident">随机事件自动抽样</div><div class="game-camera" id="gameCamera"><button data-camera="all">1 全景</button><button data-camera="apron">2 停机坪</button><button data-camera="cargo">3 货运区</button><button data-camera="tower">4 塔台</button></div><div class="game-keys">← / → 时间 · 1—4 镜头 · Esc 退出</div></div>`}
function staticResults() {
  const m=result.metrics;
  $('resultsSummary').textContent=`逐架排程结果 · 已完成 ${m.completed} / ${m.total} 架（点击${$('resultsDetails').open?'收起':'展开'}）`;
  $('metrics').innerHTML=[['计划架次',m.total+' 架'],['计划装卸量',m.cargo_planned_kg+' kg'],['累计已处理装卸量',m.cargo_handled_kg+' kg'],['其中已卸',m.cargo_unloaded_kg+' kg'],['其中已装',m.cargo_loaded_kg+' kg'],['到达未处理装卸量',m.cargo_pending_kg+' kg'],['完成航班',`${m.completed} / ${m.total}`],['准时离开',m.on_time+' 架'],['平均空中排队',fmt(m.mean_air_wait_min)+' min'],['平均货运排队',fmt(m.mean_cargo_wait_min)+' min'],['模型净收益',m.net_yuan+' 元'],['固定运营成本',m.operating_cost_yuan+' 元'],['持续维护成本',m.maintenance_cost_yuan+' 元'],['故障维修成本',m.repair_cost_yuan+' 元'],['夜间已调拨',m.relocated_aircraft+' 架'],['卡车费用',m.truck_cost_yuan+' 元'],['未完成',m.unfinished+' 架']].map(([name,value])=>`<div class="kpi"><span>${name}</span><strong>${value}</strong></div>`).join('');
  const signature=result.flights.map(f=>`${f.id}/${f.enter}/${f.service_start}/${f.service_end}/${f.exit}/${f.net_yuan}`).join('|');
  if(signature!==lastResultsSignature){lastResultsSignature=signature;$('results').innerHTML=result.flights.map(f=>`<tr>${[f.id,f.mode==='land'?'起降':'机场外',f.enter,f.service_start,f.service_end,f.exit,f.air_wait_min,f.cargo_wait_min,f.late_min,f.net_yuan].map(v=>`<td>${esc(fmt(v))}</td>`).join('')}</tr>`).join('')}
  $('note').textContent=result.note;
  $('seek').max=endTime();$('timeEnd').textContent='终点 '+clock(endTime());
}
function detailMarkup(){return `
<div id="warehouseView" class="warehouse-view" hidden>
  <div class="detail-head"><div><span class="eyebrow">INSIDE THE CARGO TERMINAL</span><h2>货运库 · 传送带运行</h2><p>卸货进入分拣区，随后按当前航班装货量送往装机口。</p></div><button id="warehouseBack">← 返回机场全景</button></div>
  <div class="warehouse-kpis" id="warehouseKpis"></div>
  <svg viewBox="0 0 1100 410" role="img" aria-label="货运库内部：收货传送带、分拣台、出库装机传送带与实时货箱">
    <defs><linearGradient id="hallFloor" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#dce8dc"/><stop offset="1" stop-color="#b8c9b8"/></linearGradient></defs>
    <rect width="1100" height="410" fill="#e8f0eb"/><path d="M0 30H1100V130H0Z" fill="#c2d4d0"/><path d="M0 130L1100 130L1100 410H0Z" fill="url(#hallFloor)"/>
    <path d="M140 0V135M420 0V135M700 0V135M980 0V135" stroke="#8fa9a4" stroke-width="13"/><path d="M0 129H1100" stroke="#7e9c97" stroke-width="12"/>
    <rect x="33" y="130" width="126" height="190" rx="8" fill="#6f9298"/><text x="50" y="160" class="hall-door">收货月台</text>
    <rect x="943" y="130" width="128" height="190" rx="8" fill="#688f83"/><text x="960" y="160" class="hall-door">装机出口</text>
    <path d="M163 202H530" class="belt-edge"/><path d="M163 215H530" class="belt-edge"/><path d="M570 291H942" class="belt-edge"/><path d="M570 304H942" class="belt-edge"/>
    <path d="M174 208H520M581 297H930" class="belt-flow"/><rect x="520" y="180" width="60" height="145" rx="10" fill="#789d92" stroke="#3f6c5b" stroke-width="4"/><text x="531" y="212" class="sorter-text">分</text><text x="531" y="253" class="sorter-text">拣</text><text x="531" y="294" class="sorter-text">台</text>
    <text x="255" y="180" class="belt-label">① 卸货传送带</text><text x="682" y="274" class="belt-label">② 装机传送带</text>
    <g id="warehouseBoxes"></g><text x="28" y="388" class="warehouse-note">货箱位置按处理进度演示；模型仅计算总装卸重量与总处理时间，不模拟每个包裹的分拣路径。</text>
  </svg>
  <div id="warehouseJobs" class="warehouse-jobs"></div>
</div>
<div id="zonePanel" class="zone-panel" hidden><div class="detail-head"><div><span id="zoneEyebrow" class="eyebrow">STAND LIVE STATUS</span><h2 id="zoneTitle">停机位</h2></div><button id="zoneBack">← 全景</button></div><div id="zoneBody"></div></div>`}
function closeDetail(){
  detail=null;
  if($('warehouseView'))$('warehouseView').hidden=true;
  if($('zonePanel'))$('zonePanel').hidden=true;
  airport3d?.resetCamera();
}
function openDetail(zone){
  detail=zone;
  $('warehouseView').hidden=zone.type!=='warehouse';
  $('zonePanel').hidden=zone.type==='warehouse';
  if(zone.type!=='warehouse')airport3d?.focusZone(zone);
  paintDetail(minute);
}
function standSnapshot(mode,slot,t){
  const list=result.flights.filter(f=>f.mode===mode&&f.slot===slot);
  const active=list.find(f=>f.enter!=null&&f.enter<=t&&(f.exit==null||t<f.exit));
  const next=list.filter(f=>f.enter!=null&&f.enter>t).sort((a,b)=>a.enter-b.enter)[0];
  return {active,next,list};
}
function paintStand(t){
  const isOutside=detail.type==='outside',mode=isOutside?'outside':'land',slot=detail.slot||0;
  const snap=standSnapshot(mode,slot,t),f=snap.active;
  $('zoneTitle').textContent=(isOutside?'机场外索降位 ':'机场停机位 ')+(slot+1);
  $('zoneBody').innerHTML=`<div class="zone-state ${f?'occupied':''}"><span>${f?'● 当前占用':'○ 当前空闲'}</span><strong>${f?esc(f.id)+' · '+status(f,t)[0]:'可供下一架使用'}</strong></div>
    <div class="detail-grid"><div><span>当前飞机</span><b>${f?esc(f.id):'—'}</b></div><div><span>预计释放</span><b>${f?fmt(f.exit)+' min':'—'}</b></div><div><span>剩余占位</span><b>${f&&f.exit!=null?Math.max(0,+(f.exit-t).toFixed(1))+' min':'—'}</b></div><div><span>下一架计划</span><b>${snap.next?esc(snap.next.id)+' · '+snap.next.enter+' min':'暂无'}</b></div></div>
    ${f?`<div class="flight-timing"><b>本架作业</b><p>到达 ${f.arrival} → 进入 ${fmt(f.enter)} → 货运 ${fmt(f.service_start)}—${fmt(f.service_end)} → 离开 ${fmt(f.exit)} min</p><p>卸货 ${f.unload_kg} kg · 装货 ${f.load_kg} kg · 迟到 ${fmt(f.late_min)} min</p></div>`:''}
    <div class="stand-plan"><b>该位置排程</b>${snap.list.length?snap.list.map(g=>`<div>${esc(g.id)}<span>${fmt(g.enter)}—${fmt(g.exit)} min</span></div>`).join(''):'<p>没有安排飞机。</p>'}</div>
    <p class="hint">该位从进入到离开持续占用；货运团队与其他位置共用。点击“全景”返回机场。</p>`;
}
function paintWarehouse(t){
  const active=result.flights.filter(f=>f.service_start!=null&&f.service_start<=t&&(f.service_end==null||t<f.service_end));
  const queue=result.flights.filter(f=>f.enter!=null&&f.enter<=t&&(f.service_start==null||t<f.service_start));
  const next=result.flights.filter(f=>f.arrival>t).sort((a,b)=>a.arrival-b.arrival)[0];
  const row=result.timeline[Math.floor(t)]||result.timeline.at(-1)||{};
  $('warehouseKpis').innerHTML=[['正在处理',active.length+' / '+applied.cargo_teams+' 组'],['等待货运',queue.length+' 架'],['本分钟处理装卸量',(row.cargo_processed_kg||0)+' kg'],['累计已处理装卸量',(row.cargo_handled_kg||0)+' kg'],['到达未处理装卸量',(row.cargo_pending_kg||0)+' kg'],['下一架计划到达',next?esc(next.id)+' · '+next.arrival+' min':'无']].map(([name,value])=>`<div><span>${name}</span><strong>${value}</strong></div>`).join('');
  $('warehouseView').classList.toggle('running',playing&&active.length>0);
  $('warehouseBoxes').innerHTML=active.flatMap((f,row)=>{
    const total=f.unload_kg+f.load_kg,progress=total?Math.max(0,Math.min(1,(t-f.service_start)*applied.cargo_rate_kg_min/total)):1;
    const share=total?f.unload_kg/total:.5;
    return [0,.12,.24].map((lag,i)=>{
      const q=Math.max(0,progress-lag);if(progress<lag)return '';
      const unloading=q<share||share>=1;
      const x=unloading?174+340*(share?Math.min(1,q/share):1):586+340*(1-share?Math.min(1,(q-share)/(1-share)):1);
      const y=(unloading?188:277)+row*21+i*5;
      return `<g class="warehouse-box" transform="translate(${x.toFixed(1)} ${y})"><rect width="31" height="25" rx="3" fill="${f.mode==='outside'?'#c99549':'#aa7c53'}" stroke="#7f5f3c" stroke-width="2"/><path d="M15 0V25" stroke="#efdbb6" stroke-width="2"/><text x="38" y="17">${esc(f.id)}</text></g>`;
    });
  }).join('');
  $('warehouseJobs').innerHTML=`<div><b>正在作业</b>${active.length?active.map(f=>`<button data-flight="${esc(f.id)}">${esc(f.id)} · 卸 ${f.unload_kg} kg / 装 ${f.load_kg} kg · ${Math.round(100*Math.min(1,(t-f.service_start)*applied.cargo_rate_kg_min/Math.max(1,f.unload_kg+f.load_kg)))}%</button>`).join(''):'<span>当前无货物处理</span>'}</div><div><b>等待队列</b>${queue.length?queue.map(f=>`<span>${esc(f.id)}</span>`).join(''):'<span>无</span>'}</div><p>箱体动画表示模型计算的装卸进度，不代表单件包裹的实际轨迹。</p>`;
  $('warehouseJobs').querySelectorAll('[data-flight]').forEach(el=>el.onclick=()=>{selected=el.dataset.flight;paint()});
}
function paintDetail(t){
  if(!detail||!result)return;
  $('zoneEyebrow').textContent=['truckDock','truckGate'].includes(detail.type)?'GROUND FREIGHT FLOW':detail.type==='taxiway'?'AIRFIELD CONNECTOR':'STAND LIVE STATUS';
  if(detail.type==='warehouse')paintWarehouse(t);
  else if(['truckDock','truckGate','taxiway'].includes(detail.type)){
    const active=result.flights.filter(f=>f.service_start!=null&&f.service_start<=t&&(f.service_end==null||t<f.service_end));
    const waiting=result.flights.filter(f=>f.enter!=null&&f.enter<=t&&(f.service_start==null||t<f.service_start));
    const land=result.flights.filter(f=>f.mode==='land'&&f.enter!=null&&f.enter<=t&&(f.exit==null||t<f.exit));
    const cargo=active.reduce((n,f)=>n+f.unload_kg+f.load_kg,0);
    const taxi=detail.type==='taxiway';
    $('zoneTitle').textContent=taxi?'滑行联络道 · 设施示意':detail.type==='truckGate'?'货车专用出入口':'货车装卸月台';
    $('zoneBody').innerHTML=taxi?
      `<div class="zone-state"><span>机场地面流线</span><strong>跑道 ↔ 联络道 ↔ 停机坪</strong></div><div class="detail-grid"><div><span>当前占用停机位</span><b>${land.length} / ${applied.pads}</b></div><div><span>当前起降航班</span><b>${land.map(f=>esc(f.id)).join('、')||'无'}</b></div></div><p class="hint">联络道用于说明场内连接关系。当前为垂直起降无人机原型，没有滑行时间、滑行道冲突或容量约束；图中道路不意味着这些飞机必须滑行。</p>`:
      `<div class="zone-state ${active.length?'occupied':''}"><span>地面货运示意</span><strong>${active.length?'月台与货车作业联动':'当前没有货运处理'}</strong></div><div class="detail-grid"><div><span>正在处理航班</span><b>${active.map(f=>esc(f.id)).join('、')||'无'}</b></div><div><span>在制装卸货量</span><b>${cargo} kg</b></div><div><span>等待货运</span><b>${waiting.length} 架</b></div><div><span>货运团队</span><b>${active.length} / ${applied.cargo_teams}</b></div><div><span>夜间调拨</span><b>${result.night.destination_aircraft} 架已抵达 · ${result.night.in_transit} 架在途</b></div><div><span>卡车成本</span><b>¥ ${result.night.cost_yuan.toFixed(2)}</b></div></div><div class="flight-timing"><b>地面转运路径</b><p>货车出入口 → 专用车道 → 装卸月台 → 货运库分拣 → 装机出口 → 停机位</p></div><p class="hint">白天货运车流仍是示意；夜间卡车调拨已计载机量、行程和费用，但未计道路容量，也未与具体航班的飞机身份耦合。</p>`;
  }
  else if(detail.type==='apron'){
    $('zoneTitle').textContent='起降坪 · 全部停机位';
    $('zoneBody').innerHTML=`<p class="hint">点击下方停机位查看该位的飞机与作业时刻。</p><div class="stand-list">${Array.from({length:applied.pads},(_,i)=>{const s=standSnapshot('land',i,t);return `<button data-pad="${i}">停机位 ${i+1}<strong>${s.active?esc(s.active.id)+' · 占用中':'空闲'}</strong></button>`}).join('')}</div>`;
    $('zoneBody').querySelectorAll('[data-pad]').forEach(el=>el.onclick=()=>openDetail({type:'pad',slot:Number(el.dataset.pad)}));
  }else paintStand(t);
}
async function api(path,payload){
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'请求失败');return data;
}
function acceptState(data){
  const prior=result,previousMinute=minute;
  if(prior&&prior.session_id===data.session_id&&data.timeline_start===data.minute){
    data.timeline=prior.timeline.slice(0,data.minute).concat(data.timeline);
  }
  sessionId=data.session_id;result=data;applied=data.params;minute=data.minute;
  if(!prior||prior.session_id!==data.session_id||minute<previousMinute){visualMinute=minute;transitionFrom=minute;lastResultsSignature='';lastCardsSignature=''}
  else if(minute>previousMinute){transitionFrom=previousMinute;visualMinute=previousMinute;transitionStart=performance.now()}
  assignSlots();airport3d?.setData(data,applied);staticResults();paint();
  if(data.done){playing=false;$('play').textContent='▶ 重新开始'}
}
async function run(paramsOverride=null){
  if(stepping)return;
  try{
    stepping=true;playing=false;$('error').textContent='';liveNotice='';
    const params=paramsOverride||collect();
    const data=await api('/api/sim/start',params);
    scenarioParams=JSON.parse(JSON.stringify(params));
    selected=null;closeDetail();acceptState(data);saveHourContext();
    playing=$('autoplay').checked;nextTick=performance.now();$('play').textContent=playing?'Ⅱ 暂停':'▶ 播放';
  }catch(e){$('error').textContent='仿真启动失败：'+e.message}finally{stepping=false}
}
function saveHourContext(){
  try{localStorage.setItem('airport-hour-scenario-v1',JSON.stringify({params:scenarioParams,minute,saved_at:new Date().toISOString()}))}
  catch(e){$('error').textContent='无法保存小时视图场景：'+e.message}
}
async function advance(){
  if(!sessionId||stepping||result?.done)return;
  try{stepping=true;const data=await api('/api/sim/step',{session_id:sessionId});liveNotice='';acceptState(data)}
  catch(e){playing=false;$('play').textContent='▶ 播放';$('error').textContent='推进失败：'+e.message}
  finally{stepping=false}
}
async function applyLiveAction(action){
  if(!sessionId||stepping)return;
  try{
    stepping=true;const data=await api('/api/sim/action',{session_id:sessionId,action});
    liveNotice=data.pending_events.map(e=>e.text).join('；');acceptState(data);
  }catch(e){$('error').textContent='操作未执行：'+e.message}finally{stepping=false}
}
function loop(now){
  if(result&&visualMinute<minute){
    const duration=1000/Number($('speed').value);
    visualMinute=Math.min(minute,transitionFrom+(minute-transitionFrom)*Math.min(1,(now-transitionStart)/duration));
    paintVisual();
  }
  if(playing&&result&&!result.done&&now>=nextTick&&!stepping&&visualMinute>=minute-1e-6){
    nextTick=now+1000/Number($('speed').value);advance();
  }
  frame=requestAnimationFrame(loop);
}
$('run').onclick=()=>run();
$('hourEntry').onclick=()=>{if(scenarioParams)saveHourContext()};
$('resultsDetails').addEventListener('toggle',()=>{if(result)staticResults()});
$('generatePlan').onclick=()=>{try{const flights=window.AirportWeb.generateFlights(Number($('planCount').value),Number($('planUnload').value),Number($('planLoad').value));$('inputRows').innerHTML='';flights.forEach(inputRow);run()}catch(e){$('error').textContent='生成日计划失败：'+e.message}};
$('reset').onclick=()=>{showInputs(defaults);run(defaults)};
$('add').onclick=()=>inputRow({id:'F'+($('inputRows').children.length+1),arrival:0,mode:'land',unload_kg:5,load_kg:5,deadline:20,fee_yuan_kg:4});
$('play').onclick=()=>{if(!result)return;if(result.done){run();return}playing=!playing;nextTick=performance.now();$('play').textContent=playing?'Ⅱ 暂停':'▶ 播放'};
$('restart').onclick=()=>run();
$('step').onclick=()=>{playing=false;$('play').textContent='▶ 播放';advance()};
$('seek').disabled=true;
$('seek').title='实时推演不能跳到尚未发生的时间；请使用播放或下一分钟';
$('export').onclick=()=>{if(!result)return;const keys=['id','mode','arrival','enter','service_start','service_end','exit','air_wait_min','cargo_wait_min','late_min','energy_kwh','net_yuan'];const rows=[keys.join(','),...result.flights.map(f=>keys.map(k=>f[k]??'').join(','))];const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+rows.join('\r\n')],{type:'text/csv;charset=utf-8'}));a.download='airport-sandbox.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
$('exportLog').onclick=()=>{if(!result)return;const payload={model:'airport-live-v2',exported_at:new Date().toISOString(),minute:result.minute,done:result.done,params:result.params,metrics:result.metrics,flights:result.flights,timeline:result.timeline,night:result.night,incidents:result.incidents,pending_events:result.pending_events};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'}));a.download='airport-live-events.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
function setView(mode){
  viewMode=mode;
  $('threeCanvas').hidden=mode!=='3d';$('svgFallback').hidden=mode!=='2d';$('cameraHint').hidden=mode!=='3d';
  $('view3d').classList.toggle('primary',mode==='3d');$('view2d').classList.toggle('primary',mode==='2d');
  if(mode==='3d')airport3d?.resize();else paintVisual();
}
function setGameMode(on){
  if(on&&!result)return;
  gameMode=on;document.body.classList.toggle('game-mode',on);
  $('gameMode').textContent=on?'✕ 退出实时动态视图':'◈ 实时动态视图';
  if(on){closeDetail();if(airport3d){setView('3d');airport3d.setCameraPreset('all')}}
  airport3d?.setGameTheme(on);
  requestAnimationFrame(()=>airport3d?.resize());
}
$('gameMode').onclick=()=>setGameMode(!gameMode);
document.addEventListener('keydown',event=>{
  if(!gameMode||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))return;
  if(event.key==='Escape'){event.preventDefault();if(detail)closeDetail();else setGameMode(false)}
  else if(event.code==='Space'){event.preventDefault();$('play').click()}
  else if(event.key==='ArrowRight'){event.preventDefault();$('step').click()}
  else if(event.key==='ArrowLeft'){event.preventDefault()}
  else if('1234'.includes(event.key)&&event.key.length===1){event.preventDefault();airport3d?.setCameraPreset(['all','apron','cargo','tower'][Number(event.key)-1])}
});
$('view3d').onclick=()=>{if(airport3d)setView('3d')};
$('view2d').onclick=()=>setView('2d');
Promise.all([fetch('/api/default').then(r=>r.json()),fetch('/scene.svg').then(r=>r.text())])
  .then(async ([p,svg])=>{
    defaults=p;
    $('sceneHost').innerHTML='<div id="threeCanvas" hidden></div><div id="svgFallback"></div><div id="cameraHint" class="camera-hint" hidden>拖动旋转视角 · 滚轮缩放 · 点击货运库、停机位或货车月台查看</div>'+gameHudMarkup()+detailMarkup();
      $('svgFallback').innerHTML=svg;
    $('gameCamera').querySelectorAll('[data-camera]').forEach(button=>button.onclick=()=>airport3d?.setCameraPreset(button.dataset.camera));
    $('warehouseBack').onclick=closeDetail;$('zoneBack').onclick=closeDetail;
    $('svgFallback').addEventListener('click',event=>{
      const target=event.target.closest('[data-zone]');
      if(target)openDetail({type:target.dataset.zone,slot:Number(target.dataset.slot||0)});
    });
    showInputs(p);await run(p);frame=requestAnimationFrame(loop);
    if(!result)return;
    try {
      const mod=await import('/scene3d.js');
      airport3d=mod.createAirport3D($('threeCanvas'),hit=>{
        if(hit.type==='flight'){selected=hit.id;paint()}
        else openDetail(hit);
      });
      airport3d.setData(result,applied);airport3d.setMinute(visualMinute,selected);setView('3d');
    } catch(e) {
      $('view3d').disabled=true;$('error').textContent='3D 图形未能加载，已显示平面示意图：'+e.message;
      setView('2d');
    }
  }).catch(e=>$('error').textContent=e.message);
