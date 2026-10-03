// Plan against published timetables, never future demand or future seat assignments.
export const CHARGE_STRATEGIES=['full','next','remaining'];
export const CHARGE_NAMES={full:'充到可用上限',next:'够飞下一段',remaining:'够完成剩余路线'};
export function chargingPlan(p,r,o,start,deficit,includeSetup=false){
 const strategy=p.chargeStrategy??'full';if(!CHARGE_STRATEGIES.includes(strategy))throw new Error('未知充电量策略');
 const budget=p.battery-p.energyReserve,g=o.groundEnergyRate??.005,storePower=(o.chargePower??.2)*(o.chargeEfficiency??.9),setup=includeSetup?(o.chargeSetupMinutes??1):0;
 const chargeStart=start+setup,soc=budget-deficit-g*setup,netPower=storePower-g,buffer=r.id===p.target?p.joinBuffer:0,takeoff=o.surfaceModel===1?(o.takeoffMinutes??0):0,due=Math.min(o.deadline??90,r.dispatchDeadline??Infinity),station=r.station;
 if(netPower<=0||soc<-1e-8||!['C','D','E'].includes(station))return null;
 const cd=r.branch==='D'?p.fullCD??p.cd:p.fullCE??p.ce,db=r.branch==='D'?p.fullDB??p.db:p.fullEB??p.eb;
 const landing=o.surfaceModel===1?(o.landingMinutes??0):0,vertical=o.surfaceModel===1?(o.takeoffEnergy??0):0,terminal=o.surfaceModel===1&&station!=='C'?(o.landingEnergy??0):0;
 const dist=station==='C'?cd:db,flight=vertical+terminal+dist*(p.k0+p.kLoad*(r.weight+(station==='C'?(r.loadC??0):(r.loadHub??0)))),travel=dist/p.speed*60+(station!=='C'?landing:0);
 const times=station==='C'?(r.branch==='D'?p.departuresC:p.departuresCE):(r.branch==='D'?p.departuresD:p.departuresEB);
 const maxDuration=Math.max(0,(budget-soc)/netPower),margin=strategy==='full'?0:(o.chargeSlackEnergy??.02);
 for(const departure of times){
  if(departure<chargeStart+buffer+takeoff||departure+travel>due+1e-9)continue;
  let onward=0,hubDeparture=null,forecastCompletion=departure+travel;
  if(strategy==='remaining'&&station==='C'){
   const work=r.workD??r.workHub??0,arrival=departure+travel,ready=arrival+work+buffer+landing+takeoff;
   onward=(work>0?p.handlingEnergyD:0)+p.loiterRate*work;
   if(r.destination==='B'){
    hubDeparture=(r.branch==='D'?p.departuresD:p.departuresEB).find(t=>t>=ready&&t+db/p.speed*60+landing<=due+1e-9);
    if(hubDeparture===undefined)continue;
    onward+=(o.surfaceModel===1?2*(o.landingEnergy??0)+vertical:0)+Math.max(0,hubDeparture-arrival-work-landing-takeoff-buffer)*(p.groundStandby?g:p.loiterRate)+(o.surfaceModel===1?p.loiterRate*buffer:0)+db*(p.k0+p.kLoad*(r.weight+(r.loadHub??0)));
    forecastCompletion=hubDeparture+db/p.speed*60+landing;
   }else{forecastCompletion=arrival+work;if(forecastCompletion>due+1e-9)continue}
  }
  // Waiting after charging cancels the g*duration term, leaving storePower below.
  const duration=strategy==='full'?maxDuration:Math.max(0,(flight+onward+margin+g*(departure-chargeStart)+(o.surfaceModel===1?(p.loiterRate-g)*buffer-g*takeoff:0)-soc)/storePower);
  if(duration>maxDuration+1e-9||chargeStart+duration+buffer+takeoff>departure+1e-9)continue;
  if(flight+g*(departure-chargeStart-duration)>soc+netPower*duration+1e-9)continue;
  return {strategy,duration,start:chargeStart,finish:chargeStart+duration,departure,hubDeparture,forecastCompletion,flightEnergy:flight,onwardEnergy:onward,margin,forecastSOC:soc+netPower*duration,storeEnergy:storePower*duration,gridEnergy:(o.chargePower??.2)*duration};
 }
 return null;
}
