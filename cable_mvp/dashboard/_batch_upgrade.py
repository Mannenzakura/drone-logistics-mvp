from pathlib import Path
p=Path(__file__).parent/'static'
f=p/'four.js';s=f.read_text(encoding='utf-8')
s=s.replace("const $=id", "import {fillBatchEditor,readBatchEditor,previewBatchEditor,variableBatchExample,renderBatchResults,updateBatchLive} from './batch_capacity_ui.mjs?v=20260930-batch1';\nconst $=id")
s=s.replace("queueFields:[", "queueFields:[['capacityMode','位次模式（0固定 / 1逐班）'],['waitWarning','滞留提示阈值 / min'],")
s=s.replace('function fill(p=FOUR_DEFAULTS){p=', 'function fill(p=FOUR_DEFAULTS){p=')
s=s.replace("$('dirty').hidden=true}\nfunction read", "fillBatchEditor(p);$('dirty').hidden=true}\nfunction read")
s=s.replace(')}return p}\nfunction card', ')}return readBatchEditor(p)}\nfunction card')
s=s.replace('  const mode=x.p.stationCount===5?', '  renderBatchResults(x);\n  const mode=x.p.stationCount===5?')
s=s.replace('`γ=${fmt(x.gamma)}；后续各编队航段`', "`C/D${x.p.stationCount===5?'/E':''} 航段 γ=${[x.legGammas.C,x.legGammas.D,...(x.p.stationCount===5?[x.legGammas.E]:[])].map(fmt).join('/')}`")
s=s.replace("`${((1-r.gamma)*100).toFixed(1)}%`", "`${((1-r.legGammas.C)*100).toFixed(1)} / ${((1-r.legGammas.D)*100).toFixed(1)}${p.stationCount===5?' / '+((1-r.legGammas.E)*100).toFixed(1):''}%`")
old="$('sceneQueues').innerHTML=stations.slice(1,-1).map((station,i)=>`"
new="$('sceneQueues').innerHTML=stations.slice(1,-1).map((station,i)=>{const upcoming=x.schedule.batches.find(b=>b.station===station&&b.time>t),hint=upcoming?`下班 ${tm(upcoming.time)} · ${upcoming.cancelled?'取消':upcoming.capacity+' 个中转位'}`:'无后续班次';return `"
s=s.replace(old,new)
s=s.replace("空位 ${p['seats'+station]} / 班 · 到站终止者不入队", '${hint}')
s=s.replace("</text></g>`).join('');\n  $('scenePlanes')", "</text></g>`}).join('');\n  updateBatchLive(x,t);\n  $('scenePlanes')")
s=s.replace("const energy=x.eAC*acProgress+x.eCD*cdProgress+x.eDB*dbProgress+", "const deProgress=p.stationCount===5?progress(t,target.departD,target.arrivalE-target.departD):0,ebProgress=p.stationCount===5?progress(t,target.departE,target.arrivalB-target.departE):0;\n  const energy=x.eAC*acProgress+x.eCD*cdProgress+(p.stationCount===5?x.eDE*deProgress+x.eEB*ebProgress:x.eDB*dbProgress)+")
s=s.replace("  const savingCD=(1-x.gamma)*p.cd*(p.k0+p.kLoad*(p.q+x.lC)),savingDB=(1-x.gamma)*(p.stationCount===5?p.de+p.eb:p.db)*(p.k0+p.kLoad*(p.q+x.lD));", "  const savingNow=x.savingCD*cdProgress+(p.stationCount===5?x.savingDE*deProgress+x.savingEB*ebProgress:x.savingDB*dbProgress);")
s=s.replace('fmt(savingCD*cdProgress+savingDB*dbProgress)', 'fmt(savingNow)')
s=s.replace("updateMode(next.p);resultPanels", "fillBatchEditor(next.p);updateMode(next.p);resultPanels")
s=s.replace("fill();$('form').noValidate", """$('variableBatches').onclick=()=>{try{fill(variableBatchExample(read()));$('dirty').hidden=false}catch(e){$('error').textContent=e.message;$('error').hidden=false}};
$('syncBatches').onclick=()=>{try{fillBatchEditor(read());$('dirty').hidden=false}catch(e){$('error').textContent=e.message;$('error').hidden=false}};
$('batchEditors').addEventListener('input',()=>{previewBatchEditor();$('dirty').hidden=false});
$('exportBatches').onclick=()=>{if(!plan)return;const rows=[['station','batch','time','planned_size','local','reserved_empty','transfer_capacity','cancelled','boarded','unused','actual_size','waiting','flights'],...plan.schedule.batches.map(b=>[b.station,b.batch+1,b.time,b.plannedSize,b.local,b.reserved,b.capacity,b.cancelled,b.boarded,b.unused,b.actualSize,b.waiting,b.flights.map(i=>'F'+(i+1)).join('|')])];const url=URL.createObjectURL(new Blob(['\\ufeff'+rows.map(r=>r.map(v=>v??'').join(',')).join('\\r\\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='per-batch-capacity.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
fill(variableBatchExample(FOUR_DEFAULTS));$('form').noValidate""")
f.write_text(s,encoding='utf-8')
f=p/'index.html';s=f.read_text(encoding='utf-8')
s=s.replace('>恢复示例</button>','>恢复固定示例</button>')
s=s.replace('两点编队排程','多点编队排程')
section='''<section class="panel" id="batchPanel"><div class="head"><h2>逐班成员与中转空位</h2><button id="variableBatches" type="button">变化空位示例</button></div><p class="hint">逐班模式：中转可用位次＝本班总规模上限－本地起飞机（包含一架领航机）－预留空位。本地飞机已安排好，不与中转队列再次抢位；预留空位暂不放行，且不算实际飞机。零空位班次照常出发。每班上限 20 架是本实验软件边界，不代表实际许可。</p><p class="hint">编辑后点击左侧“优化并应用”；模式 0 使用固定空位，模式 1 使用下表。修改发车时刻后可刷新编辑表；未匹配的新时刻按固定参数生成初始成员数，原时刻的编辑值保留。</p><button id="syncBatches" type="button">刷新班次编辑表</button><div id="batchEditors"></div><p id="batchModelNotice" class="hint"></p><details><summary>已应用班次结果与等待统计</summary><p id="batchPressure" class="hint" style="white-space:pre-line"></p><p class="hint">平均与最长滞留仅统计已发出的飞机，未发出数单列；这是有限情景统计，不是稳态平均等待或导师服务等级约束的保证。</p><button id="exportBatches" type="button">导出逐班位次 CSV</button><div class="scroll"><table><thead><tr><th>站点</th><th>班次</th><th>时刻/min</th><th>规模上限</th><th>本地机</th><th>预留空位</th><th>中转可用</th><th>已接纳</th><th>未用位次</th><th>实际规模</th><th>发车后仍排队</th><th>状态</th></tr></thead><tbody id="batchResults"></tbody></table></div></details></section>
'''
s=s.replace('<section class="panel stage">',section+'<section class="panel stage">',1)
s=s.replace('<div class="telemetry" id="telemetry">','<p id="batchLive" class="hint" aria-live="off"></p><div class="telemetry" id="telemetry">')
s=s.replace('A→C 单飞，后续各航段按本机角色计算编队巡航折扣','A→C 单飞，后续各航段按本机角色计算编队巡航折扣；逐班模式按实际登机后的编队规模重算，固定模式沿用设置的 m')
s=s.replace('本机巡航节能</th>','各航段巡航节能 C/D/E</th>')
f.write_text(s,encoding='utf-8')
for name in ['four.js','four_model.mjs','four_studies.mjs','four_studies_ui.mjs','four_studies_worker.mjs','index.html']:
    f=p/name;s=f.read_text(encoding='utf-8').replace('20260930-destinations1','20260930-batch1').replace('20261001-batch1','20260930-batch1');f.write_text(s,encoding='utf-8')
