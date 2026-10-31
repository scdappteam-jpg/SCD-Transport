/* eslint-disable @typescript-eslint/no-require-imports -- Dock compatibility domain */
const driverHistory=require('./operations-driver-history.cjs');
const unique=values=>[...new Set(values.map(v=>String(v||'').trim()).filter(Boolean))];
function houses(row){return unique([row?.houseNumber,...Array.isArray(row?.houseNumbers)?row.houseNumbers:[]]);}
function contains(row,house){return houses(row).includes(String(house||'').trim());}
function roundKey(job){
    if(!job)return '';
    const id=driverHistory.round(job).id;
    return id?JSON.stringify([job.driverId||'',id]):'';
}
function jobs(db,job){
    const key=roundKey(job);
    if(!key)return job?[job]:[];
    return (db.jobs||[]).filter(candidate=>roundKey(candidate)===key);
}
function forHouses(db,houseNumbers){
    const wanted=new Set(unique(houseNumbers));
    return (db.jobs||[]).filter(job=>wanted.has(job.houseNumber));
}
function entryForHouse(entries,house){return (entries||[]).find(entry=>contains(entry,house))||null;}
function bayForHouse(bays,house){return (bays||[]).find(bay=>contains(bay,house))||null;}
function hasProgress(job,bay){
    return (job?.driverDockHistory||[]).some(event=>event.bayId===bay.id&&event.assignedAt===bay.assignedAt);
}
function clearBay(bay){
    Object.assign(bay,{status:'Available',houseNumber:'',houseNumbers:[],vehiclePlate:'',driverName:'',assignedAt:'',assignedBy:'',queueNumber:null,queueType:'',expectedMinutes:null});
}
function normalizeBays(db){
    db.dock||={};db.dock.bays||=[];
    const grouped=new Map();
    for(const bay of db.dock.bays.filter(item=>item?.status==='Occupied'&&houses(item).length)){
        const job=(db.jobs||[]).find(candidate=>contains(bay,candidate.houseNumber));
        const key=roundKey(job)||`house:${houses(bay)[0]}`;
        if(!grouped.has(key))grouped.set(key,[]);
        grouped.get(key).push(bay);
    }
    let merged=0,blocked=0;
    for(const bays of grouped.values()){
        if(bays.length<2)continue;
        const allHouses=unique(bays.flatMap(houses));
        const seedJob=(db.jobs||[]).find(job=>allHouses.includes(job.houseNumber));
        const roundJobs=jobs(db,seedJob);
        const roundHouses=unique([...allHouses,...roundJobs.map(job=>job.houseNumber)]);
        const progressedBays=bays.filter(bay=>roundJobs.some(job=>hasProgress(job,bay)));
        if(progressedBays.length>1){blocked+=1;continue;}
        const progressedId=progressedBays[0]?.id||'';
        bays.sort((a,b)=>Number(b.id===progressedId)-Number(a.id===progressedId)||String(a.assignedAt||'').localeCompare(String(b.assignedAt||''))||String(a.id).localeCompare(String(b.id)));
        const keep=bays[0];
        Object.assign(keep,{houseNumber:roundHouses[0],houseNumbers:roundHouses,status:'Occupied'});
        for(const job of roundJobs){job.dockBayId=keep.id;job.dockBayName=keep.name;job.dockAssignedAt=keep.assignedAt;job.updatedAt=new Date().toISOString();}
        for(const duplicate of bays.slice(1))clearBay(duplicate);
        db.dock.log=[...(db.dock.log||[]),{at:new Date().toISOString(),action:'VehicleRoundConsolidated',houseNumber:roundHouses[0],houseNumbers:roundHouses,bayId:keep.id,fromBayIds:bays.slice(1).map(item=>item.id),by:'system'}].slice(-200);
        merged+=1;
    }
    return {merged,blocked};
}
function normalizeQueue(db){
    db.dock||={};
    const source=(db.dock.queue||[]).filter(entry=>houses(entry).length);
    const grouped=new Map();
    for(const entry of source){
        const job=(db.jobs||[]).find(candidate=>contains(entry,candidate.houseNumber));
        const key=roundKey(job)||`house:${houses(entry)[0]}`;
        if(!grouped.has(key)){grouped.set(key,{...entry,houseNumbers:[]});}
        const target=grouped.get(key);
        target.houseNumbers=unique([...target.houseNumbers,...houses(entry),...jobs(db,job).map(item=>item.houseNumber)]);
        if(String(entry.createdAt||entry.arrivedAt||'')<String(target.createdAt||target.arrivedAt||'')){
            for(const field of ['id','createdAt','arrivedAt','createdBy','queueNumber'])if(entry[field]!=null)target[field]=entry[field];
        }
    }
    db.dock.queue=[...grouped.values()].map(entry=>({...entry,houseNumber:entry.houseNumbers[0]}));
    return db.dock.queue;
}
module.exports={houses,contains,roundKey,jobs,forHouses,entryForHouse,bayForHouse,normalizeQueue,normalizeBays};
