const clamp=x=>Math.max(0,Math.min(1,x));
const progress=(t,start,duration)=>duration>0?clamp((t-start)/duration):Number(t>=start);
export function liveMetrics(x,time){
 const p=x.p,t=x.target,acMinutes=p.ac/p.speed*60,start=t.arrivalC-acMinutes,now=Math.min(time,t.arrivalB);
 const stages=(arrival,first,second,suffix)=>{const dropStart=arrival+(p.winchTiming?p['approach'+suffix]:p['t0'+suffix]);const dropEnd=dropStart+(p.winchTiming?x.drop:p['tDrop'+suffix])*first;const loadStart=dropEnd+(p.winchTiming?p['exchangeFixed'+suffix]+p['exchangePerKg'+suffix]*(first+second):0);const loadEnd=loadStart+(p.winchTiming?x.pickup:p['tLoad'+suffix])*second;return {dropStart,dropEnd,loadStart,loadEnd}};
 const c=stages(t.arrivalC,x.dC,x.lC,'C'),d=stages(t.arrivalD,x.lC,x.lD,'D');
 let mass=p.q+x.dC;
 if(now>=t.arrivalC)mass=p.q+x.dC*(1-progress(now,c.dropStart,c.dropEnd-c.dropStart))+x.lC*progress(now,c.loadStart,c.loadEnd-c.loadStart);
 if(now>=t.arrivalD)mass=p.q+x.lC*(1-progress(now,d.dropStart,d.dropEnd-d.dropStart))+x.lD*progress(now,d.loadStart,d.loadEnd-d.loadStart);
 const a=progress(now,start,acMinutes),b=progress(now,t.departC,t.arrivalD-t.departC),end=progress(now,t.departD,t.arrivalB-t.departD);
 const waitC=Math.max(0,Math.min(now-t.arrivalC,t.waitC)),waitD=Math.max(0,Math.min(now-t.arrivalD,t.waitD));
 const energy=x.eAC*a+x.eCD*b+x.eDB*end+p.loiterRate*(waitC+waitD)+p.handlingEnergyC*x.zC*Number(now>=t.arrivalC)+p.handlingEnergyD*x.zD*Number(now>=t.arrivalD);
 const goods=[{name:'q',kg:p.q,fee:p.feeQ,timeValue:p.timeQ,handling:p.handlingQ,from:start,to:t.arrivalB,delivery:t.arrivalB,handled:start},
 {name:'dC',kg:x.dC,fee:p.feeDropC,timeValue:p.timeDropC,handling:p.handlingDropC,from:start,to:t.arrivalC,delivery:c.dropEnd,handled:c.dropEnd},
 {name:'lC',kg:x.lC,fee:p.feeLoadC,timeValue:p.timeLoadC,handling:p.handlingLoadC,from:t.arrivalC,to:t.arrivalD,delivery:d.dropEnd,handled:c.loadEnd},
 {name:'lHub',kg:x.lD,fee:p.feeLoadD,timeValue:p.timeLoadD,handling:p.handlingLoadD,from:t.arrivalD,to:t.arrivalB,delivery:t.arrivalB,handled:d.loadEnd}].map(g=>({...g,delivered:now>=g.delivery?g.kg:0,revenue:now>=g.delivery?g.kg*g.fee:0,timeCost:g.kg*g.timeValue*Math.max(0,Math.min(now,g.to)-g.from),handlingCost:now>=g.handled?g.kg*g.handling:0}));
 const revenue=goods.reduce((v,g)=>v+g.revenue,0),timeCost=goods.reduce((v,g)=>v+g.timeCost,0),handling=goods.reduce((v,g)=>v+g.handlingCost,0),fixed=p.fixedCostC*x.zC*Number(now>=t.arrivalC)+p.fixedCostD*x.zD*Number(now>=t.arrivalD);
 const net=revenue-timeCost-handling-fixed-p.energyPrice*energy;
 const stage=now<t.arrivalC?'A→C 飞行':now<t.departC?(now<t.arrivalC+x.workC?'C 装卸作业':'C FIFO 等待'):now<t.arrivalD?'C→分支站 编队':now<t.departD?(now<t.arrivalD+x.workD?'分支站装卸作业':'分支站 FIFO 等待'):now<t.arrivalB?'分支站→B 编队':'B 已交付';
 return {mass,energy,waitC,waitD,saving:x.savingCD*b+x.savingDB*end,goods,revenue,timeCost,handling,fixed,net,stage};
}
