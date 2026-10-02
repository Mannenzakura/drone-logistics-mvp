const $=id=>document.getElementById(id),f=v=>v===null||v===undefined?'—':Number(v).toFixed(2);
let worker=null,current=null;
const colors=['#dce2de','#edc38b','#6eac88','#7196c1','#d9adbd'];
function map(id,cells,n,palette,onPick){
  const svg=$(id),w=600,h=300,cw=w/n,ch=h/n;
  svg.setAttribute('viewBox','0 0 600 300');
  svg.innerHTML=cells.map((cell,i)=>`<rect data-cell="${i}" tabindex="0" role="button" aria-label="查看第 ${cell.x+1} 列、第 ${cell.y+1} 行结果" x="${cell.x*cw}" y="${(n-1-cell.y)*ch}" width="${cw}" height="${ch}" stroke="white" stroke-width=".5" fill="${palette[cell.code]}" style="cursor:crosshair"/>`).join('');
  let active=-1;
  const pick=e=>{const i=Number(e.target?.dataset?.cell);if(!Number.isInteger(i)||i<0||i>=cells.length||e.target?.dataset?.cell===undefined||i===active)return;
    if(active>=0){const old=svg.querySelector(`[data-cell="${active}"]`);old?.setAttribute('stroke','white');old?.setAttribute('stroke-width','.5')}
    active=i;e.target.setAttribute('stroke','#143d2c');e.target.setAttribute('stroke-width','2');onPick(cells[i]);
  };
  svg.onpointermove=pick;svg.onclick=pick;svg.onfocusin=pick;
  svg.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick(e)}};
  const initial=Math.floor(cells.length/2);pick({target:svg.querySelector(`[data-cell="${initial}"]`)});
}
function result(r){
  map('fourWinchMap',r.winch,r.n,colors,c=>{
    $('fourWinchDetail').textContent=`C 卸 dC=${f(c.dC)} kg、C 装/D 卸 lC=${f(c.lC)} kg：${c.best?`最优 D 装 lD=${f(c.best.lD)} kg，任务净收益 ${f(c.best.net)}；相对无新增货同路线任务增益 ${f(c.delta)}；离 C ${f(c.best.departC)} min，离 D ${f(c.best.departD)} min。`:'该组合在当前载荷、电量、班次、空域或绞盘限制下不可行。'}`.replaceAll('D',current.hub??'D');
  });
  map('fourFormationMap',r.formation,r.n,['#dce2de','#6eac88','#edc38b','#7196c1','#d9adbd'],c=>{
    $('fourFormationDetail').textContent=`总距离 ${f(c.distance)} km、固定货 q=${f(c.q)} kg：编队 ${c.formation?`净收益 ${f(c.formation.net)}，能耗 ${f(c.formation.energy)} kWh`:'不可行'}；同路线单飞 ${c.solo?`净收益 ${f(c.solo.net)}，能耗 ${f(c.solo.energy)} kWh`:'不可行'}；编队净收益差 ${f(c.delta)}。`;
  });
  $('fourWinchAxes').textContent=`横轴：C 卸货 dC，0–${f(current.p.demandDropC)} kg；纵轴（向上）：C 装/D 卸 lC，0–${f(current.p.demandLoadC)} kg。每格重新优化 lD。`.replaceAll('D',current.hub??'D');
  $('fourFormationAxes').textContent=`横轴：当前路线总距离 ${f(r.distanceMax/r.n)}–${f(r.distanceMax)} km（按当前各航段比例缩放）；纵轴（向上）：q，0–${f(r.payloadMax)} kg。`;
  $('fourFifoRows').replaceChildren();
  for(const v of r.fifo){const tr=document.createElement('tr');for(const val of [`F${(current.idMap?.[v.id]??v.id)+1}`,v.destination,f(v.arrivalC),f(v.departC),f(v.waitC),f(v.arrivalD),f(v.departD),f(v.waitD),f(v.arrivalE),f(v.departE),f(v.waitE),f(v.delayC),f(v.delayD),f(v.delayE)]){const td=document.createElement('td');td.textContent=val;tr.append(td)}$('fourFifoRows').append(tr)}
  const max=Math.max(1,...r.timeline.flatMap(v=>[v.c,v.d,v.e]));
  const path=key=>r.timeline.map((v,i)=>`${i?'L':'M'}${20+i*560/60},${140-v[key]*120/max}`).join(' ');
  $('fourQueueChart').innerHTML=`<path d="${path('c')}" stroke="#176b52" fill="none" stroke-width="2"/><path d="${path('d')}" stroke="#ba812e" fill="none" stroke-width="2"/><path d="${path('e')}" stroke="#7196c1" fill="none" stroke-width="2"/><text x="20" y="158" font-size="10">0 min</text><text x="500" y="158" font-size="10">${f(r.timeline.at(-1).time)} min</text><text x="20" y="13" font-size="10">队列峰值刻度 ${max} 架</text>`;
  const risk=r.risks,s=risk.summary;
  $('fourRiskSummary').innerHTML=`<span>到达 B：${s.completed}/${s.trials}（${f(100*s.completionRate)}%）</span><span>电量内可执行：${s.viable}/${s.trials}（${f(100*s.viableRate)}%）</span><span>到达者晚点：${s.late}/${s.completed}</span><span>到达者平均晚点：${f(s.meanDelayB)} min</span><span>可执行试验平均净收益：${f(s.meanNet)}</span><span>到达但超电量：${s.overBattery}</span><span>平均取消班次：${f(s.meanCancelled)}</span><span>平均队首占位事件：${f(s.meanBlocked)}</span>`;
  $('fourRiskRows').replaceChildren();for(const v of risk.sample.rows){const tr=document.createElement('tr');for(const value of [`F${(current.idMap?.[v.id]??v.id)+1}${v.id===current.p.target?' ★':''}`,v.destination,f(v.arrivalC),f(v.departC),f(v.arrivalD),f(v.departD),f(v.arrivalE),f(v.departE),f(v.arrivalB),f(v.deltaB)]){const td=document.createElement('td');td.textContent=value;tr.append(td)}$('fourRiskRows').append(tr)}
  if(current.hub){
    for(const row of $('fourFifoRows').children){for(const i of [13,10,9,8])row.children[i]?.remove();if(row.children[1]?.textContent==='D')row.children[1].textContent=current.hub}
    for(const row of $('fourRiskRows').children){for(const i of [7,6])row.children[i]?.remove();if(row.children[1]?.textContent==='D')row.children[1].textContent=current.hub}
    for(const id of ['fourWinchDetail','fourWinchAxes'])$(id).textContent=$(id).textContent.replaceAll('D',current.hub);
  }
  $('fourStudiesStatus').textContent='当前路线专题已更新。移动鼠标经过色块即可查看数值；触屏可点按，键盘可聚焦查看。';
}
export function runFourStudies(plan){
  current=plan;worker?.terminate();$('fourStudiesStatus').textContent='正在重新计算当前路线分区与跨站排队…';
  for(const id of ['fourWinchMap','fourFormationMap','fourQueueChart','fourFifoRows','fourRiskRows','fourRiskSummary'])$(id).replaceChildren();
  $('fourWinchDetail').textContent='计算中…';$('fourFormationDetail').textContent='计算中…';
  worker=new Worker(new URL('./four_studies_worker.mjs?v=20261002-network17',import.meta.url),{type:'module'});
  worker.onmessage=({data})=>{if(data.error)$('fourStudiesStatus').textContent=`专题未完成：${data.error}`;else result(data.result);worker?.terminate();worker=null};
  worker.onerror=()=>{$('fourStudiesStatus').textContent='专题计算未能载入，请刷新重试。';worker?.terminate();worker=null};
  worker.postMessage({plan,options:{distanceMax:Number($('studyDistanceMax').value),payloadMax:Number($('studyPayloadMax').value),risks:{
    arrivalJitter:Number($('riskArrival').value),serviceJitterC:Number($('riskServiceC').value),transitJitter:Number($('riskTransit').value),serviceJitterD:Number($('riskServiceD').value),
    cancelChance:Number($('riskCancel').value),seed:Number($('riskSeed').value),trials:Number($('riskTrials').value)}}});
}
export function setupFourStudies(){ $('runFourStudies').onclick=()=>{if(current)runFourStudies(current)}; }
