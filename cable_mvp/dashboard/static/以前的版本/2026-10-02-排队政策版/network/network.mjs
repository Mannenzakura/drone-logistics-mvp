import {EXAMPLE,simulateNetwork} from './engine.mjs?v=20260929-network2';
const $=id=>document.getElementById(id);
const lists=['arrivalsC','serviceC','serviceD','departuresC','departuresD'];
const numbers=['seatsC','seatsD','travelCD','travelDB','seed','arrivalJitter','serviceJitterC','transitJitter','serviceJitterD','cancelChance'];
let result=null, minute=0,playing=false,last=0;
const fmt=x=>x===null||x===undefined?'—':`${x.toFixed(1)}`;
const clock=x=>`${Math.floor(x).toString().padStart(2,'0')}:${Math.floor((x%1)*60).toString().padStart(2,'0')}`;
function read(){const p={};for(const key of lists){const raw=$(key).value.trim();p[key]=raw?raw.split(/[,，\s]+/).map(Number):[];if(p[key].some(x=>!Number.isFinite(x)))throw new Error(`${key} 含非数字`)}for(const key of numbers){const raw=$(key).value.trim();if(raw==='')throw new Error(`${key} 不能为空`);p[key]=Number(raw)}return p}
function metric(label,value){return `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`}
function summary(){const s=result.summary;$('metrics').innerHTML=[metric('抵达 B',`${s.completed} / ${s.total} 架`),metric('C 平均滞留',s.meanWaitC===null?'—':`${fmt(s.meanWaitC)} min`),metric('D 平均滞留',s.meanWaitD===null?'—':`${fmt(s.meanWaitD)} min`),metric('B 平均晚点',s.meanDelayB===null?'—':`${fmt(s.meanDelayB)} min`),metric('晚点在 D 放大',`${s.amplified} 架`)].join('')}
function tables(){
  $('rows').replaceChildren();$('focus').replaceChildren();
  result.comparisons.forEach(f=>{
    const option=document.createElement('option');option.value=f.id;option.textContent=`F${f.id+1}`;$('focus').append(option);
    const tr=document.createElement('tr');tr.tabIndex=0;tr.title='点击关注此飞机';tr.onclick=()=>{$('focus').value=f.id;render()};
    const propagation=f.delayC===null||f.delayD===null?null:f.delayD-f.delayC;
    for(const value of [`F${f.id+1}`,fmt(f.arrivalC),fmt(f.arrivalC+f.serviceC),fmt(f.departureC),fmt(f.waitC),fmt(f.delayC),fmt(f.arrivalD),fmt(f.departureD),fmt(f.waitD),fmt(f.delayD),fmt(propagation),fmt(f.arrivalB),fmt(f.delayB)]){const td=document.createElement('td');td.textContent=value;tr.append(td)}$('rows').append(tr);
  });
  $('focus').value=String(Math.min(2,result.comparisons.length-1));
  $('events').replaceChildren();result.scenario.events.forEach((e,i)=>{const row=document.createElement('div');row.className='event';row.dataset.time=e.time;const tm=document.createElement('time');tm.textContent=clock(e.time);const desc=document.createElement('span');desc.textContent=e.text;row.append(tm,desc);$('events').append(row)});
}
function pointFor(f,t,queueC,queueD){
  const atC=queueC.findIndex(x=>x.id===f.id),atD=queueD.findIndex(x=>x.id===f.id);
  if(t<f.arrivalC)return [100,220,'未到 C'];
  if(f.departureC===null||t<f.departureC)return [340+(atC%5-2)*35,146+Math.floor(atC/5)*38,'C 点排队/作业'];
  if(f.arrivalD===null)return [340,220,'未抵达 D'];
  if(t<f.arrivalD){const r=(t-f.departureC)/(f.arrivalD-f.departureC||1);return [340+370*r,220,'C→D 飞行']}
  if(f.departureD===null||t<f.departureD)return [710+(atD%5-2)*35,146+Math.floor(atD/5)*38,'D 点排队/作业'];
  if(f.arrivalB===null)return [710,220,'未抵达 B'];
  if(t<f.arrivalB){const r=(t-f.departureD)/(f.arrivalB-f.departureD||1);return [710+290*r,220,'D→B 飞行']}
  return [1000,220,'已抵达 B'];
}
function render(){if(!result)return;
  const t=Math.max(0,Math.min(result.horizon,minute));$('clock').textContent=clock(t);$('seek').value=Math.round(t/result.horizon*1000);
  const flights=result.scenario.flights,focus=Number($('focus').value),f=flights[focus];
  const queueC=flights.filter(x=>x.arrivalC<=t&&(x.departureC===null||t<x.departureC)).sort((a,b)=>a.arrivalC-b.arrivalC||a.id-b.id);
  const queueD=flights.filter(x=>x.arrivalD!==null&&x.arrivalD<=t&&(x.departureD===null||t<x.departureD)).sort((a,b)=>a.arrivalD-b.arrivalD||a.id-b.id);
  const stations=[['A',100],['C',340],['D',710],['B',1000]];
  $('routeLabels').innerHTML=stations.map(([name,x])=>`<circle cx="${x}" cy="220" r="14" fill="#206c51"/><text x="${x}" y="225" text-anchor="middle" fill="white" font-size="15" font-weight="800">${name}</text><text x="${x}" y="261" text-anchor="middle" class="scene-label">${name==='C'||name==='D'?`${name} · 中转点`:name==='A'?'始发点':'目的地'}</text>`).join('');
  const nextC=result.scenario.tripsC.find(x=>x.time>=t&&!x.cancelled),nextD=result.scenario.tripsD.find(x=>x.time>=t&&!x.cancelled);
  $('trips').innerHTML=`<rect x="225" y="20" width="230" height="58" rx="12" fill="white" stroke="#bbd4c1"/><text x="240" y="43" class="scene-small">C 排队 ${queueC.length} 架 · 下班 ${nextC?clock(nextC.time):'无'}</text><text x="240" y="63" class="scene-small">班次空位 ${result.parameters.seatsC}</text><rect x="595" y="20" width="230" height="58" rx="12" fill="white" stroke="#bbd4c1"/><text x="610" y="43" class="scene-small">D 排队 ${queueD.length} 架 · 下班 ${nextD?clock(nextD.time):'无'}</text><text x="610" y="63" class="scene-small">班次空位 ${result.parameters.seatsD}</text>`;
  $('planes').innerHTML=flights.map(item=>{const [x,y]=pointFor(item,t,queueC,queueD),chosen=item.id===focus;
    return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle r="${chosen?26:19}" fill="${chosen?'#d49a40':'#5c9c82'}" opacity=".16"/><path d="M18 0L-14 -6L-9 0L-14 6Z M0 0L-8 -15L-12 -15L-7 0L-12 15L-8 15Z" fill="${chosen?'#bd7b17':'#207354'}"/><text x="-13" y="-24" class="scene-small">F${item.id+1}</text></g>`}).join('');
  const [, ,state]=pointFor(f,t,queueC,queueD);
  const comparison=result.comparisons[focus],extra=comparison.delayC===null||comparison.delayD===null?null:comparison.delayD-comparison.delayC;
  $('focusStatus').textContent=`关注 F${focus+1}：${state}。C 出发晚 ${fmt(comparison.delayC)} min，D 出发晚 ${fmt(comparison.delayD)} min，传播增量 ${fmt(extra)} min；到 B ${fmt(f.arrivalB)} min。`;
  [...$('events').children].forEach(el=>el.classList.toggle('active',Number(el.dataset.time)<=t&&Number(el.dataset.time)>t-1));
  $('sceneNote').textContent=`扰动种子 ${result.parameters.seed} · 已取消 ${result.summary.cancellations} 班 · 曲线位置按实际到达、作业完成和登编时刻计算`;
}
function run(){try{const next=simulateNetwork(read());result=next;$('error').hidden=true;minute=0;summary();tables();render();playing=true;$('play').textContent='Ⅱ 暂停';last=performance.now()}catch(e){$('error').textContent=e.message;$('error').hidden=false}}
$('run').onclick=run;$('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'Ⅱ 暂停':'▶ 播放';last=performance.now()};$('reset').onclick=()=>{playing=false;$('play').textContent='▶ 播放';minute=0;render()};$('seek').oninput=()=>{playing=false;$('play').textContent='▶ 播放';minute=Number($('seek').value)/1000*(result?.horizon||1);render()};$('focus').onchange=render;
function frame(now){if(playing&&result){minute=Math.min(result.horizon,minute+(now-last)/1000*Number($('speed').value));if(minute>=result.horizon){playing=false;$('play').textContent='▶ 播放'}render()}last=now;requestAnimationFrame(frame)}requestAnimationFrame(frame);
run();
