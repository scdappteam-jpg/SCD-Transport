/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS warehouse domain service. */
const groups=require('./dock-vehicle-group.cjs');
const planning=require('./dock-planning.cjs');
const {ready}=require('./dock-readiness.cjs');
const enabled=db=>db.dock?.autoDispatch?.enabled!==false;
function dispatch(db,at=new Date().toISOString()){
    if(!enabled(db)||!db.dock?.bays?.length||!db.dock?.queue?.length)return [];
    groups.normalizeQueue(db);
    const assigned=[];
    for(const entry of planning.queue(db)){
        if(!ready(db,entry))continue;
        const rows=groups.forHouses(db,groups.houses(entry));
        if(rows.some(job=>groups.bayForHouse(db.dock.bays,job.houseNumber)?.status==='Occupied'))continue;
        const plates=[...new Set(rows.map(job=>String(job.vehiclePlate).normalize('NFKC').toUpperCase().replace(/[\s-]/g,'')))];
        if(plates.length!==1||new Set(rows.map(job=>job.driverId)).size!==1)continue;
        const bay=planning.suggest(db,rows[0],entry);
        if(!bay)continue;
        const plate=rows[0].vehiclePlate;
        try{groups.assertVehicleAvailable(db,plate,bay.id);}catch{continue;}
        const houses=rows.map(job=>job.houseNumber);
        Object.assign(bay,{status:'Occupied',houseNumber:houses[0],houseNumbers:houses,vehiclePlate:plate,driverName:rows[0].driverName||entry.driverName||'',assignedAt:at,assignedBy:'system:auto-dock',queueNumber:entry.queueNumber||null,queueType:planning.kind(rows[0],entry),expectedMinutes:Number(db.meetingSafety?.queueMinutes)||15});
        for(const job of rows)Object.assign(job,{dockBayId:bay.id,dockBayName:bay.name,dockAssignedAt:at,updatedAt:at});
        db.dock.queue=db.dock.queue.filter(item=>!houses.some(h=>groups.contains(item,h)));
        db.dock.log=[...(db.dock.log||[]),{at,action:'AutoAssigned',houseNumber:houses[0],houseNumbers:houses,bayId:bay.id,by:'system:auto-dock'}].slice(-200);
        for(const houseNumber of houses){db.activityLogs||=[];db.activityLogs.push({logId:require('node:crypto').randomUUID(),houseNumber,activityType:'DockAssigned',dockBay:bay.name,userId:'system:auto-dock',startTime:at,createdAt:at,detail:'ระบบเรียกเข้าท่าอัตโนมัติ รอคนขับยืนยันเข้าท่าจริง'});}
        assigned.push({bayId:bay.id,houseNumbers:houses});
    }
    return assigned;
}
module.exports={enabled,ready,dispatch};
