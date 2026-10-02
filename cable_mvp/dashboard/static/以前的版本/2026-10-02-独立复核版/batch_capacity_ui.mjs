import {activeStations,batchPressure,stationTrips} from './batch_capacity.mjs?v=20261002-review15';
const $=id=>document.getElementById(id),fmt=x=>x===null||x===undefined?'—':Number(x).toFixed(2);
const keys=['batchSize','batchLocal','batchReserved'];
function defaults(p,s,i){const size=p['batchSize'+s]?.[i]??Math.max(p.formationSize,p['seats'+s]+1);return [size,p['batchLocal'+s]?.[i]??Math.max(1,size-p['seats'+s]),p['batchReserved'+s]?.[i]??0]}
export function fillBatchEditor(p){
  const container=$('batchEditors');container.replaceChildren();if(p.capacityMode!==1){const note=document.createElement('p');note.textContent=p.capacityMode===2?'随机模式：程序按种子、编队上限和各站本地需求概率生成名单，应用后在下方班次结果查看。':'固定模式；切换手工模式后可编辑逐班名单。';container.append(note);return}
  for(const station of ['C','D','E']){
    const wrap=document.createElement('div');wrap.hidden=station==='E'&&p.stationCount!==5;
    const title=document.createElement('h3');title.textContent=`${station} 点班次成员表`;wrap.append(title);
    const scroll=document.createElement('div');scroll.className='scroll';const table=document.createElement('table');
    table.innerHTML='<thead><tr><th>班次</th><th>时刻/min</th><th>总规模上限</th><th>本地起飞机（含领航）</th><th>预留空位</th><th>中转可用位次</th></tr></thead>';
    const body=document.createElement('tbody');
    p['departures'+station].forEach((time,index)=>{
      const row=document.createElement('tr');row.dataset.station=station;row.dataset.time=String(time);
      for(const text of [index+1,time]){const cell=document.createElement('td');cell.textContent=text;row.append(cell)}
      defaults(p,station,index).forEach((value,column)=>{
        const cell=document.createElement('td'),input=document.createElement('input');input.type='number';input.min=column===2?'0':'1';input.max='20';input.step='1';input.value=value;input.dataset.key=keys[column];
        input.setAttribute('aria-label',`${station} 第 ${index+1} 班 ${['总规模','本地飞机','预留空位'][column]}`);input.style.cssText='width:85px;padding:6px;border:1px solid #cbdccf;border-radius:6px';cell.append(input);row.append(cell);
      });
      const cap=document.createElement('td');cap.dataset.capacity='';row.append(cap);body.append(row);
    });
    table.append(body);scroll.append(table);wrap.append(scroll);container.append(wrap);
  }
  previewBatchEditor();
}
export function previewBatchEditor(){
  for(const row of $('batchEditors').querySelectorAll('tr[data-station]')){
    const [size,local,reserved]=[...row.querySelectorAll('input')].map(input=>input.value.trim()===''?NaN:Number(input.value));
    const valid=[size,local,reserved].every(v=>Number.isInteger(v)&&v>=0&&v<=20)&&size>=1&&local>=1&&local+reserved<=size;
    const cell=row.querySelector('[data-capacity]');cell.textContent=valid?`${size-local-reserved} 个`:'配置有误';cell.style.color=valid?'#176b52':'#a3392e';
  }
}
export function readBatchEditor(p){
  if(p.capacityMode!==1)return p;
  for(const station of ['C','D','E']){
    const previous=new Map([...$('batchEditors').querySelectorAll(`tr[data-station="${station}"]`)].map(row=>[Number(row.dataset.time),[...row.querySelectorAll('input')].map(input=>input.value.trim()===''?NaN:Number(input.value))]));
    keys.forEach((key,column)=>p[key+station]=p['departures'+station].map((time,index)=>(previous.get(time)??defaults(p,station,index))[column]));
  }
  return p;
}
export function variableBatchExample(p){
  const next={...p,capacityMode:1};
  for(const station of ['C','D','E']){
    const n=p['departures'+station].length;
    next['batchSize'+station]=Array(n).fill(10);
    next['batchLocal'+station]=Array.from({length:n},(_,i)=>[7,10,6,8,9][i%5]);
    next['batchReserved'+station]=Array(n).fill(0);
  }
  return next;
}
export function renderBatchResults(plan){
  const body=$('batchResults');body.replaceChildren();
  for(const b of plan.schedule.batches){
    const row=document.createElement('tr');row.dataset.station=b.station;row.dataset.time=b.time;
    const blocked=plan.schedule.events.some(e=>e.station===b.station&&e.time===b.time&&e.type==='blocked');
    const state=b.cancelled?'取消':b.capacity===0?'正常出发 · 零中转位':blocked?'队首未就绪':b.boarded?'已接纳中转机':'无中转机登机';
    for(const value of [b.station,b.batch+1,b.time,b.plannedSize,b.local??'未建模',b.reserved,b.capacity,b.cancelled?'—':b.boarded,b.unused,b.actualSize??'固定能耗口径',b.waiting,state]){const cell=document.createElement('td');cell.textContent=value;row.append(cell)}
    body.append(row);
  }
  const stats=batchPressure(plan.p,plan.schedule);
  $('batchPressure').textContent=stats.map(s=>`${s.station}：继续中转到达 ${s.arrived} 架 / 有效供给 ${s.offered} 位；已发 ${s.boarded} 架，未发 ${s.unserved} 架；已发者平均滞留 ${fmt(s.meanWait)} min，最长 ${fmt(s.maxWait)} min；超过 ${plan.p.waitWarning} min 的 ${s.exceeded} 架；零空位班次 ${s.zeroTrips} 班。`).join('\n');
  $('batchModelNotice').textContent=plan.p.capacityMode!==0?`${plan.p.capacityMode===2?'已应用随机本地需求，种子 '+plan.p.batchSeed+'。':'已应用逐班成员表。'}实际出发规模＝本地飞机＋本班成功登机的中转飞机；预留空位不视为实际飞机，不贡献节能。费用仍只计算目标机。`:'已应用固定位次模式：班次中转容量固定，本地成员没有逐班建模；能耗仍使用设置的编队规模。';
}
export function updateBatchLive(plan,time){
  const recent=plan.schedule.batches.filter(b=>b.time<=time).sort((a,b)=>b.time-a.time).slice(0,3);
  $('batchLive').textContent=recent.length?recent.map(b=>`${b.station} 第 ${b.batch+1} 班 @ ${b.time} min：${b.cancelled?'已取消':`可用 ${b.capacity} 位、接纳 ${b.boarded} 架、剩余 ${b.unused} 位${b.actualSize!==null?`、实际出发 ${b.actualSize} 架`:''}`}`).join('；'):'时间尚未推进到首班编队出发。';
}
