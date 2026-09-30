(() => {
  const $=id=>document.getElementById(id);
  const esc=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const time=t=>`${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;
  const number=x=>Number(x||0).toFixed(2);
  const key='airport-hour-scenario-v1';
  let frames=[],flights=[],scenario,selectedHour=0,selectedMinute=0,visualTime=0,animationTimer=0,playing=false,playStart=0,playOrigin=0,hourCount=24,slots=new Map(),lastSceneTick=-1;

  function readScenario(){
    try {
      const stored=JSON.parse(localStorage.getItem(key)||'null');
      if(stored?.params)return stored;
    }catch(e){$('error').textContent='读取全局场景失败，将使用默认演示参数：'+e.message}
    return {params:window.AirportWeb.default,minute:0,saved_at:null};
  }
  function build(){
    const source=readScenario();scenario=source.params;
    $('source').textContent=source.saved_at?`已载入全局沙盘场景 · 原页面进入时刻 ${time(Math.floor(source.minute||0))} · 随机种子 ${scenario.random_seed} · ${scenario.flights.length} 架次`:'未找到刚才的全局场景，当前使用默认演示场景。请从全天总览的“进入小时运营视图”打开以带入自定义参数。';
    let state=window.AirportWeb.request('/api/sim/start',scenario);
    function keep(s){frames[s.minute]={row:s.timeline.at(-1),metrics:s.metrics,night:s.night,incidents:s.incidents}}
    keep(state);
    while(!state.done){state=window.AirportWeb.request('/api/sim/step',{session_id:state.session_id});keep(state)}
    flights=state.flights;hourCount=Math.max(1,Math.ceil(scenario.horizon_min/60));
    assignSlots();buildSceneStands();
    selectedMinute=Math.max(0,Math.min(scenario.horizon_min-1,Math.floor(source.minute||0)));
    selectedHour=Math.floor(selectedMinute/60);visualTime=selectedMinute;
    render();
  }
  function hourBounds(){return [selectedHour*60,Math.min((selectedHour+1)*60-1,scenario.horizon_min)]}
  function frameAt(t){return frames[Math.max(0,Math.min(t,frames.length-1))]}
  function stat(name,value){return `<div class="kpi"><span>${name}</span><strong>${value}</strong></div>`}
  function mini(name,value){return `<div><span>${name}</span><strong>${value}</strong></div>`}
  function renderHours(){
    $('hours').innerHTML=Array.from({length:hourCount},(_,h)=>`<button data-hour="${h}" class="${h===selectedHour?'active':''}">${String(h).padStart(2,'0')}:00</button>`).join('');
    $('hours').querySelectorAll('[data-hour]').forEach(button=>button.onclick=()=>{
      stop();selectedHour=Number(button.dataset.hour);selectedMinute=selectedHour*60;visualTime=selectedMinute;render();
    });
  }
  function renderSummary(){
    const [start,end]=hourBounds(),rows=frames.slice(start,end+1).map(f=>f.row);
    const settleEnd=Math.min((selectedHour+1)*60,scenario.horizon_min);
    const after=frameAt(settleEnd).metrics,before=frameAt(start).metrics;
    const diff=k=>Number((after[k]-(before?.[k]||0)).toFixed(2));
    const arrivals=flights.filter(f=>f.arrival>=start&&f.arrival<=end).length;
    const incidents=rows.flatMap(r=>r.events).filter(e=>e.type==='incident_started').length;
    const avgQueue=(rows.reduce((n,r)=>n+r.air_queue+r.cargo_queue,0)/rows.length).toFixed(1);
    $('hourTitle').textContent=`${time(start)}—${time(end)} · ${rows.length} 分钟`;
    $('hourMetrics').innerHTML=[stat('计划到达',arrivals+' 架'),stat('实际离开',rows.reduce((n,r)=>n+r.departed.length,0)+' 架'),stat('本小时装卸',diff('cargo_handled_kg')+' kg'),stat('平均队列',avgQueue+' 架'),stat('突发事件',incidents+' 起'),stat('本小时净收益','¥ '+number(diff('net_yuan'))),stat('固定运营费','¥ '+number(diff('operating_cost_yuan'))),stat('持续维护费','¥ '+number(diff('maintenance_cost_yuan'))),stat('故障维修费','¥ '+number(diff('repair_cost_yuan'))),stat('卡车费用','¥ '+number(diff('truck_cost_yuan')))].join('');
    const hourly=flights.filter(f=>f.arrival>=start&&f.arrival<=end);
    $('hourFlights').innerHTML=hourly.length?`<table><thead><tr><th>航班</th><th>计划到达</th><th>模式</th><th>卸 / 装 kg</th><th>进入</th><th>货运开始</th><th>离开</th><th>迟到</th></tr></thead><tbody>${hourly.map(f=>`<tr><td>${esc(f.id)}</td><td>${time(f.arrival)}</td><td>${f.mode==='land'?'起降':'机场外'}</td><td>${f.unload_kg} / ${f.load_kg}</td><td>${f.enter==null?'—':time(f.enter)}</td><td>${f.service_start==null?'—':time(f.service_start)}</td><td>${f.exit==null?'未完成':time(f.exit)}</td><td>${f.late_min??'—'} min</td></tr>`).join('')}</tbody></table>`:'<p class="hint">本小时没有计划到达航班。</p>';
    const events=rows.flatMap(r=>(r.events||[]).filter(e=>!['queue','cargo_queue'].includes(e.type)).map(e=>({minute:r.minute,text:e.text})));
    $('hourEvents').innerHTML=events.length?events.map(e=>`<button data-minute="${e.minute}"><time>${time(e.minute)}</time><span>${esc(e.text)}</span></button>`).join(''):'<p class="hint">本小时没有离散事件。</p>';
    $('hourEvents').querySelectorAll('[data-minute]').forEach(button=>button.onclick=()=>{stop();selectedMinute=Number(button.dataset.minute);visualTime=selectedMinute;renderMinute()});
  }
  function renderChart(){
    const [start,end]=hourBounds(),rows=frames.slice(start,end+1).map(f=>f.row),max=Math.max(1,...rows.map(r=>r.cargo_processed_kg));
    $('minuteChart').innerHTML=rows.map(r=>{
      const hasIncident=r.events.some(e=>e.type.startsWith('incident_')),hasTruck=r.events.some(e=>e.type.startsWith('truck_'));
      return `<button data-minute="${r.minute}" class="${r.minute===selectedMinute?'selected':''}" title="${time(r.minute)} · 装卸 ${r.cargo_processed_kg} kg · 排队 ${r.air_queue+r.cargo_queue} 架"><i style="height:${Math.max(2,100*r.cargo_processed_kg/max)}%"></i>${r.air_queue+r.cargo_queue?'<b class="queue"></b>':''}${hasIncident?'<b class="incident"></b>':''}${hasTruck?'<b class="truck"></b>':''}</button>`;
    }).join('');
    $('minuteChart').querySelectorAll('[data-minute]').forEach(button=>button.onclick=()=>{stop();selectedMinute=Number(button.dataset.minute);visualTime=selectedMinute;renderMinute()});
  }
  function status(f,t){
    if(t<f.arrival)return '未到达';if(f.enter==null||t<f.enter)return '等待入场';
    if(f.service_start==null||t<f.service_start)return '等待货运';
    if(f.service_end==null||t<f.service_end)return '货运处理中';
    if(f.exit==null||t<f.exit)return '等待离场';return '已离开';
  }
  function assignSlots(){
    for(const mode of ['land','outside']){
      const ends=[];
      flights.filter(f=>f.mode===mode&&f.enter!=null).sort((a,b)=>a.enter-b.enter||a.id.localeCompare(b.id)).forEach(f=>{
        let slot=ends.findIndex(end=>end<=f.enter);if(slot<0)slot=ends.length;
        ends[slot]=f.exit??Infinity;slots.set(f.id,slot);
      });
    }
  }
  function stand(f){
    const slot=slots.get(f.id)||0;
    return f.mode==='land'?[310+(slot%2)*135,170+Math.floor(slot/2)*87]:[720+(slot%3)*80,158];
  }
  function buildSceneStands(){
    $('padLayer').innerHTML=Array.from({length:Math.min(4,scenario.pads)},(_,slot)=>{
      const x=310+(slot%2)*135,y=170+Math.floor(slot/2)*87;
      return `<g><circle cx="${x}" cy="${y}" r="32" fill="#f5faf4" stroke="#6f9a81" stroke-width="3"/><path d="M${x-16} ${y}H${x+16}M${x} ${y-16}V${y+16}" stroke="#a2bfa9" stroke-width="3"/><text x="${x-16}" y="${y+62}" class="scene-label">P${slot+1}</text></g>`;
    }).join('');
    $('outsideLayer').innerHTML=Array.from({length:Math.min(3,scenario.outside_bays)},(_,slot)=>{
      const x=720+slot*80;return `<g><circle cx="${x}" cy="158" r="26" fill="#fff8e5" stroke="#bd9952" stroke-width="3" stroke-dasharray="5 4"/><text x="${x-13}" y="196" class="scene-label">O${slot+1}</text></g>`;
    }).join('');
  }
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const lerp=(a,b,p)=>a+(b-a)*p;
  function renderScene(t){
    if(!frames.length)return;
    const frame=frameAt(Math.floor(t)),row=frame.row;
    $('sceneClock').textContent=`${time(Math.floor(t))}:${String(Math.floor((t%1)*60)).padStart(2,'0')}`;
    const queue=flights.filter(f=>f.arrival<=t&&(f.enter==null||t<f.enter));
    const visible=flights.filter(f=>f.arrival<=t&&(f.exit==null||t<f.exit+.8)).slice(0,18);
    $('flightLayer').innerHTML=visible.map(f=>{
      const [sx,sy]=stand(f),qi=Math.max(0,queue.findIndex(q=>q.id===f.id)),hold=[105+(qi%3)*37,115+Math.floor(qi/3)*29];
      let x=sx,y=sy,rotation=0;
      if(f.enter==null||t<f.enter){x=hold[0];y=hold[1]}
      else if(t<f.enter+.8){const p=clamp((t-f.enter)/.8,0,1);x=lerp(hold[0],sx,p);y=lerp(hold[1],sy,p)}
      else if(f.exit!=null&&t>=f.exit){const p=clamp((t-f.exit)/.8,0,1);x=lerp(sx,1015,p);y=lerp(sy,63,p);rotation=90}
      return `<g class="scene-plane" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rotation})"><circle r="20" fill="${f.mode==='outside'?'#f8e2a7':'#cde9d5'}" stroke="${f.mode==='outside'?'#ad8236':'#308261'}" stroke-width="2"/><path d="M0 -17L5 -5L16 2L16 6L5 4L4 14L0 17L-4 14L-5 4L-16 6L-16 2L-5 -5Z" fill="${f.mode==='outside'?'#a57733':'#176a54'}"/></g><text class="scene-flight-id" x="${x.toFixed(1)}" y="${(y+34).toFixed(1)}">${esc(f.id)}</text>`;
    }).join('');
    const active=flights.filter(f=>f.service_start!=null&&f.service_start<=t&&(f.service_end==null||t<f.service_end));
    $('hourScene').classList.toggle('cargo-active',active.length>0);
    $('cargoLayer').innerHTML=active.slice(0,4).map((f,i)=>{
      const progress=clamp((t-f.service_start)/Math.max(1,f.service_end-f.service_start),0,1),x=610+280*progress,y=280+i*8;
      return `<g transform="translate(${x.toFixed(1)} ${y})"><rect class="scene-box" width="23" height="20" rx="3"/><path d="M11 0V20" stroke="#e9d4af"/><title>${esc(f.id)} · 装卸 ${(progress*100).toFixed(0)}%</title></g>`;
    }).join('');
    const trucks=frame.night.trips.filter(trip=>trip.depart<=t&&t<trip.arrive);
    $('truckLayer').innerHTML=(trucks.length?trucks:[{truck:0,depart:t,arrive:t+1,parked:true}]).slice(0,3).map((trip,i)=>{
      const p=trip.parked?0:clamp((t-trip.depart)/(trip.arrive-trip.depart),0,1),x=92+790*p,y=371+i*14;
      return `<g transform="translate(${x.toFixed(1)} ${y})"><rect class="scene-truck" x="-22" y="-12" width="34" height="19" rx="3"/><path d="M12 -5H22L27 6H12Z" fill="#bcd1d6" stroke="#456c79" stroke-width="2"/><circle cx="-12" cy="9" r="5" fill="#314b50"/><circle cx="17" cy="9" r="5" fill="#314b50"/><title>${trip.parked?'备用卡车待命':`卡车 ${trip.truck+1} 在途 ${(p*100).toFixed(0)}%`}</title></g>`;
    }).join('');
    const tick=Math.floor(t);
    if(tick!==lastSceneTick){
      lastSceneTick=tick;
      const incident=frame.incidents.find(item=>item.status==='active');
      $('sceneStatus').innerHTML=`<span>在场与排队 <strong>${visible.filter(f=>f.exit==null||t<f.exit).length} 架</strong></span><span>货运作业 <strong>${active.length} / ${row.capacity.cargo_teams} 组</strong></span><span>夜间卡车在途 <strong>${trucks.length} 辆</strong></span><span>${incident?'突发事件：'+esc(incident.label):'运行正常'}</span>`;
    }
  }
  function renderMinute(){
    const f=frameAt(selectedMinute),r=f.row,n=f.night,m=f.metrics;
    $('minuteClock').textContent=time(selectedMinute);
    $('minuteRange').min=hourBounds()[0];$('minuteRange').max=hourBounds()[1];$('minuteRange').value=selectedMinute;
    $('minuteState').innerHTML=`<div class="hour-mini">${mini('共享空域动作',r.airspace_used+' / '+r.capacity.airspace_per_min)}${mini('起降位',r.pads_used+' / '+r.capacity.pads)}${mini('机场外作业位',r.outside_used+' / '+r.capacity.outside_bays)}${mini('货运团队',r.cargo_teams_used+' / '+r.capacity.cargo_teams)}${mini('等待入场',r.air_queue+' 架')}${mini('等待货运',r.cargo_queue+' 架')}</div>`;
    const active=flights.filter(x=>x.arrival<=selectedMinute&&(x.exit==null||x.exit>selectedMinute));
    $('minuteFlights').innerHTML=`<div class="hour-list"><b>当前相关航班</b>${active.length?active.slice(0,12).map(x=>`<div>${esc(x.id)} · ${status(x,selectedMinute)} · 卸 ${x.unload_kg} / 装 ${x.load_kg} kg</div>`).join(''):'<div>当前没有在场或排队航班</div>'}</div>`;
    const incident=f.incidents.find(x=>x.status==='active');
    $('minuteCargoNight').innerHTML=`<div class="hour-mini">${mini('本分钟装卸',r.cargo_processed_kg+' kg')}${mini('累计装卸',m.cargo_handled_kg+' kg')}${mini('到达未处理',m.cargo_pending_kg+' kg')}${mini('机场备用机',n.airport_aircraft+' 架')}${mini('卡车在途',n.in_transit+' 架')}${mini('外部基地已到',n.destination_aircraft+' 架')}</div><div class="hour-list"><div>当前突发事件：${incident?esc(incident.label)+'，预计 '+time(incident.end_min)+' 恢复':'无'}</div><div>卡车费用：¥ ${number(n.cost_yuan)} · 本小时维护/维修见上方汇总</div>${n.trips.filter(trip=>trip.depart<=selectedMinute&&trip.arrive>=selectedMinute).map(trip=>`<div>卡车 ${trip.truck+1}：${trip.aircraft} 架，${time(trip.depart)}—${time(trip.arrive)} · ${trip.state==='road'?'在途':'已送达'}</div>`).join('')}</div>`;
    $('minuteChart').querySelectorAll('button').forEach(button=>button.classList.toggle('selected',Number(button.dataset.minute)===selectedMinute));
    renderScene(visualTime);
  }
  function render(){renderHours();renderSummary();renderChart();renderMinute()}
  function stop(){playing=false;if(animationTimer)clearInterval(animationTimer);animationTimer=0;$('playHour').textContent='▶ 播放本小时'}
  function animate(now){
    if(!playing)return;
    visualTime=Math.min(hourBounds()[1],Math.max(playOrigin,playOrigin+(now-playStart)/800));
    const whole=Math.floor(visualTime);
    if(whole!==selectedMinute){selectedMinute=whole;renderMinute()}
    renderScene(visualTime);
    if(visualTime>=hourBounds()[1]){stop();return}
  }
  $('prevMinute').onclick=()=>{stop();selectedMinute=Math.max(hourBounds()[0],selectedMinute-1);visualTime=selectedMinute;renderMinute()};
  $('nextMinute').onclick=()=>{stop();selectedMinute=Math.min(hourBounds()[1],selectedMinute+1);visualTime=selectedMinute;renderMinute()};
  $('minuteRange').oninput=event=>{stop();selectedMinute=Number(event.target.value);visualTime=selectedMinute;renderMinute()};
  $('nextEvent').onclick=()=>{
    stop();const [start,end]=hourBounds();
    const next=frames.slice(Math.max(start,selectedMinute+1),end+1).find(f=>f.row.events.some(e=>!['queue','cargo_queue'].includes(e.type)));
    if(next){selectedMinute=Math.max(start,next.row.minute-1);visualTime=selectedMinute;renderMinute()}
  };
  $('playHour').onclick=()=>{
    if(playing){stop();return}
    if(visualTime>=hourBounds()[1]){selectedMinute=hourBounds()[0];visualTime=selectedMinute;renderMinute()}
    playing=true;playOrigin=visualTime;playStart=performance.now();$('playHour').textContent='Ⅱ 暂停';
    animationTimer=setInterval(()=>animate(performance.now()),32);
  };
  try{build()}catch(e){$('error').textContent='小时运营视图无法建立：'+e.message}
})();
