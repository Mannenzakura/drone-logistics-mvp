// Station pads are occupied from landing reservation through takeoff completion.
// Landing and takeoff share a FIFO pool of movement channels at each station.
export function createSurface(o,h){
 const enabled=o.surfaceModel===1,padCount=o.padCount??2,channels=o.movementChannels??1;
 if(![0,1].includes(o.surfaceModel??0)||!Number.isInteger(padCount)||padCount<0||padCount>20||!Number.isInteger(channels)||channels<1||channels>10)throw new Error('起降开关0/1、停机位0–20整数、起降通道1–10整数');
 for(const k of ['landingMinutes','takeoffMinutes','landingEnergy','takeoffEnergy','padCostPerMinute','movementCostPerMinute'])if(!Number.isFinite(o[k]??0)||(o[k]??0)<0)throw new Error(k+'须为非负有限数');
 const pads=Object.fromEntries(['C','D','E'].map(s=>[s,Array(padCount).fill(null)])),moves=Object.fromEntries(['C','D','E'].map(s=>[s,Array(channels).fill(null)])),landing={C:[],D:[],E:[]},pending={C:[],D:[],E:[]};
 const active=r=>!['terminated','done','flying'].includes(r.state);
 function takeoff(r){if(!enabled||r.state!=='ready'||!r.landed)return;const c=r.surfaceHistory.at(-1);if(!c||c.takeoffScheduled)return;
  const times=h.times(r),buffer=h.buffer(r),t=times.find(t=>t>=h.now()+(o.takeoffMinutes??0)+buffer-1e-9);if(t===undefined)return;
  c.takeoffScheduled=t;h.add(Math.max(h.now(),t-(o.takeoffMinutes??0)-buffer),1,()=>{if(r.state!=='ready'||!r.landed||r.surfaceHistory.at(-1)!==c)return;c.takeoffRequested=h.now();r.state='takeoffQueued';h.log(r,'takeoffQueue',`F${r.id+1}等待${r.station}起飞通道`);pending[r.station].push({r,c,kind:'takeoff'});pump(r.station)})
 }
 function land(r){if(!enabled)return false;h.settle(r);const c={station:r.station,requested:h.now(),pad:null,landingStart:null,landingEnd:null,takeoffStart:null,takeoffEnd:null,releasedAt:null,local:r.origin===r.station};r.surfaceHistory.push(c);r.state='surfaceQueued';h.wait(r,c.local);landing[r.station].push({r,c});h.log(r,'padQueue',`F${r.id+1}等待${r.station}停机位`);pump(r.station);return true;}
 function pump(station){
  for(let i=0;i<pads[station].length;i++){if(pads[station][i]!==null)continue;const x=landing[station].find(x=>x.r.state==='surfaceQueued');if(!x)break;x.r.state='landingQueued';x.c.pad=i;pads[station][i]=x.r.id;pending[station].push({...x,kind:'landing'})}
  for(let i=0;i<moves[station].length;i++){if(moves[station][i]!==null)continue;const x=pending[station].find(x=>x.r.state===x.kind+'Queued');if(!x)break;const {r,c,kind}=x,duration=kind==='landing'?(c.local?0:o.landingMinutes??0):o.takeoffMinutes??0,energy=kind==='landing'?(c.local?0:o.landingEnergy??0):o.takeoffEnergy??0;
   moves[station][i]=r.id;r.state=kind;c[kind+'Start']=h.now();c.channel=i;
   if(!h.motion(r,duration,energy)){moves[station][i]=null;continue}
   h.log(r,kind,`F${r.id+1}在${station}${kind==='landing'?'降落':'起飞'}`);
   h.add(h.now()+duration,1,()=>{if(r.state!==kind||r.surfaceHistory.at(-1)!==c)return;c[kind+'End']=h.now();moves[station][i]=null;r.state='ready';
    if(kind==='landing'){r.landed=true;if(!c.local)r.landings=(r.landings??0)+1;h.wait(r,true);h.ready(r);if(r.state==='ready')takeoff(r)}
    else{r.landed=false;r.surfaceReadyTime=h.now();c.releasedAt=h.now();pads[station][c.pad]=null;h.wait(r,false);h.log(r,'airborneReady',`F${r.id+1}已起飞，等待编队发出`)}pump(station)
   })
  }
 }
 function release(r){if(!enabled)return;const s=r.station;if(!pads[s])return;const c=r.surfaceHistory.at(-1);if(c&&c.releasedAt===null)c.releasedAt=h.now();for(const a of [pads[s],moves[s]]){const i=a.indexOf(r.id);if(i>=0)a[i]=null}pump(s)}
 return {enabled,land,takeoff,release,padCount,channels};
}
