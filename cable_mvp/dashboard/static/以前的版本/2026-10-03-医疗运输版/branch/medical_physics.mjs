import {effectivePayload} from '../four_model.mjs?v=20261003-network27';
export function medicalBounds(p,r,o={}){
 const surface=o.surfaceModel===1,up=surface?(o.takeoffMinutes??0):0,down=surface?(o.landingMinutes??0):0;
 const branch=r.branch,cd=branch==='D'?(p.fullCD??p.cd):(p.fullCE??p.ce),db=branch==='D'?(p.fullDB??p.db):(p.fullEB??p.eb),a=r.origin==='A',c=['A','C'].includes(r.origin),b=r.destination==='B';
 const dist=(a?p.ac:0)+(c?cd:0)+(b?db:0),work=(c?(r.workC??0):0)+(r.workHub??0),vertical=surface?((a?up:0)+(c?up+(a?down:0):up)+(b?down:0)):0;
 const routeMinutes=dist/p.speed*60+vertical+work,due=(r.dispatchDeadline??1530)-r.created;
 const directMinutes=p.direct/p.speed*60+up+down,directEnergy=p.direct*(p.k0+p.kLoad*r.weight)+(surface?(o.takeoffEnergy??0)+(o.landingEnergy??0):0);
 const directFeasible=a&&b&&Number.isFinite(p.direct)&&p.direct>0&&directMinutes<=due+1e-9&&directEnergy<=p.battery-p.energyReserve+1e-9&&r.weight<=effectivePayload({...p,ac:p.direct,cd:0,db:0})&&(p.allowExtrapolation||p.direct<=p.referenceRange);
 return {routeMinutes,due,routeTimeImpossible:routeMinutes>due+1e-9,directMinutes,directEnergy,directFeasible};
}
