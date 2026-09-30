/* Browser implementation of the incremental airport model for static hosting. */
(() => {
  function generateFlights(count=116,averageUnload=12,averageLoad=10){
    if(!Number.isInteger(count)||count<1||count>200||!Number.isFinite(averageUnload)||averageUnload<0||!Number.isFinite(averageLoad)||averageLoad<0)throw Error('日计划须为 1—200 架，平均货量须为非负数字');
    const weights=[...Array(6).fill(1),...Array(4).fill(10),...Array(6).fill(5),...Array(4).fill(8),...Array(4).fill(2)];
    const base=weights.reduce((a,b)=>a+b,0),hourly=weights.map(w=>Math.floor(count*w/base));
    let remaining=count-hourly.reduce((a,b)=>a+b,0);
    const order=weights.map((_,h)=>h).sort((a,b)=>(count*weights[b]%base)-(count*weights[a]%base)||a-b);
    for(const hour of order.slice(0,remaining))hourly[hour]++;
    const flights=[],unloadOffsets=[-4,-2,0,2,4,0],loadOffsets=[-4,-2,0,2,4];
    for(let hour=0;hour<24;hour++)for(let k=0;k<hourly[hour];k++){
      const index=flights.length,arrival=hour*60+Math.floor((k+1)*60/(hourly[hour]+1));
      flights.push({id:`F${String(index+1).padStart(3,'0')}`,arrival,mode:(index+1)%4===0?'outside':'land',
        unload_kg:Math.max(0,averageUnload+unloadOffsets[index%6]),load_kg:Math.max(0,averageLoad+loadOffsets[(index*2)%5]),
        deadline:arrival+20,fee_yuan_kg:4});
    }
    return flights;
  }
  const DEFAULT = {
    airspace_per_min:1,pads:2,outside_bays:1,cargo_teams:1,cargo_rate_kg_min:5,
    outside_uses_shared_airspace:false,hold_kwh_min:.045,outside_kwh_min:.045,
    electricity_yuan_kwh:1,handling_yuan_kg:.4,delay_yuan_min:2,
    day_fixed_yuan_hour:24,night_fixed_yuan_hour:12,maintenance_yuan_hour:6,pad_repair_yuan:80,horizon_min:1440,
    random_events_enabled:true,random_seed:20260927,incident_probability_hour:0.35,
    night_truck_enabled:true,night_depart_min:1320,night_aircraft_at_airport:4,
    night_target_transfer:3,night_trucks:2,night_truck_capacity:2,night_trip_min:45,
    night_turnaround_min:20,night_truck_cost_yuan:30,
    flights:generateFlights()
  };
  const copy=x=>structuredClone(x), round=(x,n)=>Number(x.toFixed(n));
  const active=new Set(['waiting_cargo','processing','ready']);
  const processed=(f,t,rate)=>f.service_start===null?0:Math.min(f.unload_kg+f.load_kg,Math.max(0,t-f.service_start)*rate);
  function validate(raw){
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('参数必须是对象');
    const p={...copy(DEFAULT),...copy(raw)};
    if(typeof p.random_events_enabled!=='boolean')throw Error('随机事件开关必须为布尔值');
    if(!Number.isInteger(p.random_seed)||p.random_seed<0||p.random_seed>4294967295)throw Error('随机种子须为0至4294967295的整数');
    if(!Number.isFinite(p.incident_probability_hour)||p.incident_probability_hour<0||p.incident_probability_hour>1)throw Error('每小时事件概率须为0至1');
    for(const key of ['airspace_per_min','pads','outside_bays','cargo_teams','horizon_min']){
      if(!Number.isInteger(p[key])||p[key]<1)throw Error(key+'必须是正整数');
    }
    for(const key of ['night_depart_min','night_aircraft_at_airport','night_target_transfer','night_trucks','night_truck_capacity','night_trip_min','night_turnaround_min']){
      if(!Number.isInteger(p[key])||p[key]<(key==='night_truck_capacity'||key==='night_trip_min'?1:0))throw Error(key+'必须是有效整数');
    }
    if(typeof p.night_truck_enabled!=='boolean')throw Error('夜间卡车开关必须为布尔值');
    if(!Number.isFinite(p.night_truck_cost_yuan)||p.night_truck_cost_yuan<0)throw Error('卡车费用必须是非负数');
    if(p.night_target_transfer>p.night_aircraft_at_airport||p.night_truck_enabled&&p.night_target_transfer&&p.night_trucks<1)throw Error('夜间调拨目标或卡车数无效');
    for(const key of ['cargo_rate_kg_min','hold_kwh_min','outside_kwh_min','electricity_yuan_kwh','handling_yuan_kg','delay_yuan_min','day_fixed_yuan_hour','night_fixed_yuan_hour','maintenance_yuan_hour','pad_repair_yuan']){
      if(!Number.isFinite(p[key])||p[key]<(key==='cargo_rate_kg_min'?Number.EPSILON:0))throw Error(key+'必须是有效数字');
    }
    if(typeof p.outside_uses_shared_airspace!=='boolean')throw Error('空域开关必须为布尔值');
    if(!Array.isArray(p.flights)||!p.flights.length||p.flights.length>200)throw Error('航班数量须为1至200');
    const ids=new Set();
    for(const f of p.flights){
      if(typeof f.id!=='string'||!f.id.trim()||ids.has(f.id))throw Error('航班ID为空或重复');ids.add(f.id);
      if(!['land','outside'].includes(f.mode))throw Error(f.id+'作业模式无效');
      for(const key of ['arrival','deadline'])if(!Number.isInteger(f[key])||f[key]<0)throw Error(f.id+'.'+key+'须为非负整数');
      for(const key of ['unload_kg','load_kg','fee_yuan_kg'])if(!Number.isFinite(f[key])||f[key]<0)throw Error(f.id+'.'+key+'须为非负数字');
    }
    return p;
  }
  class Simulation{
    constructor(raw){
      this.params=validate(raw);this.minute=-1;this.timeline=[];this.pending_events=[];
      this.initial_capacity=Object.fromEntries(['pads','outside_bays','cargo_teams','airspace_per_min'].map(k=>[k,this.params[k]]));
      this.jobs=this.params.flights.map(f=>({...copy(f),state:'future',enter:null,service_start:null,service_end:null,exit:null})).sort((a,b)=>a.arrival-b.arrival||a.id.localeCompare(b.id));
      this.night={airport_aircraft:this.params.night_aircraft_at_airport,in_transit:0,destination_aircraft:0,trips:[],cost_yuan:0};
      this.truckReady=Array(this.params.night_trucks).fill(this.params.night_depart_min);
      this.operatingCostYuan=0;this.maintenanceCostYuan=0;this.repairCostYuan=0;
      this.randomState=this.params.random_seed;this.incidents=[];this.activeIncident=null;
    }
    get done(){return this.minute>=this.params.horizon_min}
    random(){this.randomState=(Math.imul(1664525,this.randomState)+1013904223)>>>0;return this.randomState/4294967296}
    stepIncidents(t,events){
      if(this.activeIncident&&t>=this.activeIncident.end_min){
        const incident=this.activeIncident,key=incident.resource;
        this.params[key]=this.initial_capacity[key];incident.status='recovered';
        events.push({type:'incident_recovered',flight:null,text:`${incident.label}解除，${key}恢复至 ${this.params[key]}`});this.activeIncident=null;
      }
      if(!this.params.random_events_enabled||t<60||t%60||t>=this.params.horizon_min-30)return;
      const chance=this.random(),kind=this.random(),duration=this.random();
      if(this.activeIncident||chance>=this.params.incident_probability_hour)return;
      const key=kind<.5&&this.params.pads>1?'pads':'airspace_per_min';if(this.params[key]<=0)return;
      const label=key==='pads'?'停机位临时故障':'临时空域关闭';
      const incident={id:this.incidents.length+1,kind:key==='pads'?'pad_fault':'airspace_closure',label,resource:key,start_min:t,end_min:t+10+Math.floor(duration*21),status:'active',repair_cost_yuan:key==='pads'?this.params.pad_repair_yuan:0};
      this.params[key]--;this.repairCostYuan+=incident.repair_cost_yuan;this.incidents.push(incident);this.activeIncident=incident;
      events.push({type:'incident_started',flight:null,text:`${label}，${key}降至 ${this.params[key]}，预计第 ${incident.end_min} 分钟恢复`});
    }
    action(kind){
      if(this.done)throw Error('仿真已结束，请重新开始');
      const choices={pad_fault:['pads',-1,'停机位故障，可用停机位'],pad_restore:['pads',1,'停机位恢复，可用停机位'],team_add:['cargo_teams',1,'增加货运团队，总团队数'],airspace_reduce:['airspace_per_min',-1,'收紧共享空域，每分钟动作容量'],airspace_restore:['airspace_per_min',1,'恢复共享空域，每分钟动作容量']};
      const choice=choices[kind];if(!choice)throw Error('未知调度操作');
      const [key,delta,label]=choice,old=this.params[key];
      const next=delta>0&&['pad_restore','airspace_restore'].includes(kind)?Math.min(this.initial_capacity[key],old+delta):Math.max(0,old+delta);
      if(next===old)throw Error('资源容量已经达到该操作的边界');
      this.params[key]=next;if(kind==='pad_fault')this.repairCostYuan+=this.params.pad_repair_yuan;
      this.pending_events.push({type:'action',flight:null,text:`${label} ${old} → ${next}`});return this.snapshot();
    }
    step(compact=false){
      if(this.done)return this.snapshot(compact);
      const t=++this.minute,p=this.params,events=this.pending_events;this.pending_events=[];
      if(t>0){const hour=((t-1)%1440)/60;this.operatingCostYuan+=(hour>=6&&hour<22?p.day_fixed_yuan_hour:p.night_fixed_yuan_hour)/60;this.maintenanceCostYuan+=p.maintenance_yuan_hour/60}
      this.stepIncidents(t,events);
      this.stepNight(t,events);
      const finished=[],departed=[],entered=[],started=[];
      for(const f of this.jobs)if(f.state==='processing'&&f.service_end<=t){f.state='ready';finished.push(f.id);events.push({type:'service_end',flight:f.id,text:`${f.id} 完成货运处理`})}
      let airLeft=p.airspace_per_min;
      for(const f of this.jobs){
        if(f.state!=='ready')continue;
        const shared=f.mode==='land'||p.outside_uses_shared_airspace;
        if(shared&&airLeft===0)continue;if(shared)airLeft--;
        f.exit=t;f.state='done';departed.push(f.id);events.push({type:'depart',flight:f.id,text:`${f.id} 离开机场`});
      }
      for(const f of this.jobs){
        if(f.state!=='future'||f.arrival>t)continue;
        const cap=f.mode==='land'?p.pads:p.outside_bays;
        const occupied=this.jobs.filter(g=>g.mode===f.mode&&active.has(g.state)).length;
        const shared=f.mode==='land'||p.outside_uses_shared_airspace;
        if(occupied>=cap||(shared&&airLeft===0))continue;if(shared)airLeft--;
        f.enter=t;f.state='waiting_cargo';entered.push(f.id);events.push({type:'enter',flight:f.id,text:`${f.id} 进入作业位`});
      }
      let free=Math.max(0,p.cargo_teams-this.jobs.filter(f=>f.state==='processing').length);
      for(const f of this.jobs){
        if(f.state!=='waiting_cargo'||free===0)continue;free--;
        f.service_start=t;f.service_end=t+Math.max(1,Math.ceil((f.unload_kg+f.load_kg)/p.cargo_rate_kg_min));f.state='processing';
        started.push(f.id);events.push({type:'service',flight:f.id,text:`${f.id} 开始货运处理`});
      }
      for(const f of this.jobs){
        if(f.state==='future'&&f.arrival<=t)events.push({type:'queue',flight:f.id,text:`${f.id} 等待空域或作业位`});
        else if(f.state==='waiting_cargo')events.push({type:'cargo_queue',flight:f.id,text:`${f.id} 等待货运团队`});
      }
      const handled=this.jobs.reduce((n,f)=>n+processed(f,t,p.cargo_rate_kg_min),0);
      const priorHandled=this.jobs.reduce((n,f)=>n+processed(f,t-1,p.cargo_rate_kg_min),0);
      const arrivedCargo=this.jobs.filter(f=>f.arrival<=t).reduce((n,f)=>n+f.unload_kg+f.load_kg,0);
      this.timeline.push({minute:t,airspace_used:p.airspace_per_min-airLeft,
        pads_used:this.jobs.filter(f=>f.mode==='land'&&active.has(f.state)).length,
        outside_used:this.jobs.filter(f=>f.mode==='outside'&&active.has(f.state)).length,
        cargo_teams_used:this.jobs.filter(f=>f.state==='processing').length,
        air_queue:this.jobs.filter(f=>f.state==='future'&&f.arrival<=t).length,
        cargo_queue:this.jobs.filter(f=>f.state==='waiting_cargo').length,
        cargo_processed_kg:round(handled-priorHandled,2),cargo_handled_kg:round(handled,2),cargo_pending_kg:round(arrivedCargo-handled,2),
        entered,started,finished,departed,events,
        capacity:Object.fromEntries(Object.keys(this.initial_capacity).map(k=>[k,p[k]]))});
      return this.snapshot(compact);
    }
    stepNight(t,events){
      const p=this.params,n=this.night;if(!p.night_truck_enabled)return;
      for(const trip of n.trips)if(trip.state==='road'&&trip.arrive<=t){
        trip.state='delivered';n.in_transit-=trip.aircraft;n.destination_aircraft+=trip.aircraft;
        events.push({type:'truck_arrive',flight:null,text:`夜间卡车 ${trip.truck+1} 到达外部基地，交付 ${trip.aircraft} 架飞机`});
      }
      if(t<p.night_depart_min)return;
      let remaining=p.night_target_transfer-n.in_transit-n.destination_aircraft;
      for(let truck=0;truck<this.truckReady.length&&remaining>0;truck++){
        if(this.truckReady[truck]>t)continue;
        const load=Math.min(p.night_truck_capacity,remaining,n.airport_aircraft);if(load<=0)break;
        n.airport_aircraft-=load;n.in_transit+=load;n.cost_yuan+=p.night_truck_cost_yuan;
        n.trips.push({truck,depart:t,arrive:t+p.night_trip_min,aircraft:load,state:'road'});
        this.truckReady[truck]=t+2*p.night_trip_min+p.night_turnaround_min;remaining-=load;
        events.push({type:'truck_depart',flight:null,text:`夜间卡车 ${truck+1} 装载 ${load} 架备用飞机，发往外部基地`});
      }
    }
    snapshot(compact=false){
      const p=this.params;
      const flights=this.jobs.map(f=>{
        const row={...f,completed:f.exit!==null,air_wait_min:f.enter===null?null:f.enter-f.arrival,
          cargo_wait_min:f.service_start===null?null:f.service_start-f.enter,
          late_min:f.exit===null?null:Math.max(0,f.exit-f.deadline),energy_kwh:null,net_yuan:null};
        if(row.completed){
          const cargo=f.unload_kg+f.load_kg;
          const energy=row.air_wait_min*p.hold_kwh_min+(f.mode==='outside'?(f.exit-f.enter)*p.outside_kwh_min:0);
          row.energy_kwh=round(energy,4);row.net_yuan=round(cargo*(f.fee_yuan_kg-p.handling_yuan_kg)-energy*p.electricity_yuan_kwh-row.late_min*p.delay_yuan_min,2);
        }
        return row;
      });
      const complete=flights.filter(f=>f.completed),mean=(key)=>complete.length?round(complete.reduce((n,f)=>n+f[key],0)/complete.length,2):null;
      const handled=this.jobs.reduce((n,f)=>n+processed(f,this.minute,p.cargo_rate_kg_min),0);
      const unloaded=this.jobs.reduce((n,f)=>n+Math.min(f.unload_kg,processed(f,this.minute,p.cargo_rate_kg_min)),0);
      const arrivedCargo=this.jobs.filter(f=>f.arrival<=this.minute).reduce((n,f)=>n+f.unload_kg+f.load_kg,0);
      const metrics={completed:complete.length,total:flights.length,on_time:complete.filter(f=>f.late_min===0).length,
        cargo_planned_kg:round(this.jobs.reduce((n,f)=>n+f.unload_kg+f.load_kg,0),2),
        cargo_handled_kg:round(handled,2),cargo_unloaded_kg:round(unloaded,2),cargo_loaded_kg:round(handled-unloaded,2),
        cargo_pending_kg:round(arrivedCargo-handled,2),
        mean_air_wait_min:mean('air_wait_min'),mean_cargo_wait_min:mean('cargo_wait_min'),
        net_yuan:round(complete.reduce((n,f)=>n+f.net_yuan,0)-this.night.cost_yuan-this.operatingCostYuan-this.maintenanceCostYuan-this.repairCostYuan,2),
        operating_cost_yuan:round(this.operatingCostYuan,2),
        maintenance_cost_yuan:round(this.maintenanceCostYuan,2),repair_cost_yuan:round(this.repairCostYuan,2),
        truck_cost_yuan:round(this.night.cost_yuan,2),relocated_aircraft:this.night.destination_aircraft,
        unfinished:flights.length-complete.length,
        last_exit_min:complete.length?Math.max(...complete.map(f=>f.exit)):null};
      return {minute:this.minute,done:this.done,params:copy(p),metrics,flights,
        timeline:copy(compact?this.timeline.slice(-1):this.timeline),timeline_start:compact?this.minute:0,night:copy(this.night),incidents:copy(this.incidents),
        pending_events:copy(this.pending_events),note:'固定运营费、持续维护费与停机位故障维修费均为演示假设；夜间卡车仅调拨预置备用飞机。收益仍未计巡航、起降和设施资本成本。',session_id:'browser-local'};
    }
  }
  let session=null;
  window.AirportWeb={default:copy(DEFAULT),generateFlights,request(path,payload){
    if(path==='/api/sim/start'){session=new Simulation(payload);return session.step(true)}
    if(!session||payload?.session_id!=='browser-local')throw Error('仿真会话不存在，请重新开始');
    if(path==='/api/sim/step')return session.step(true);
    if(path==='/api/sim/action'){const state=session.action(payload.action);state.timeline=state.timeline.slice(-1);state.timeline_start=session.minute;return state}
    throw Error('未知仿真接口');
  }};
})();
