/* eslint-disable @typescript-eslint/no-require-imports -- server-only compatibility domain */
const planning = require('./dock-planning.cjs');
const roles = new Set(['Admin','Executive','Team_Transport','WH_Staff','WH3_TeamLeader']);
const isSit = house => /^SIT(?:UI)?[-A-Z0-9]/i.test(String(house || ''));
function ensureInboundBays(db) {
    db.dock ||= {}; db.dock.bays ||= [];
    // Preflight every name before adding anything. Never reset existing bays.
    for (const n of [9,10,11]) {
        const collision=db.dock.bays.find(b=>b.id!==`D${n}` && String(b.name).replace(/\s/g,'')===`ท่า${n}`);
        if(collision)throw Object.assign(new Error(`ชื่อท่า ${n} มีอยู่ด้วยรหัสอื่น กรุณาตรวจการตั้งค่า`),{statusCode:409});
    }
    const added=[];
    for(const n of [9,10,11])if(!db.dock.bays.some(b=>b.id===`D${n}`)) {
        const bay={id:`D${n}`,name:`ท่า ${n}`,zone:'WH3',status:'Available',note:'Inbound'};
        db.dock.bays.push(bay);added.push(bay.id);
    }
    ensureTickets(db);
    return added;
}
function ensureTickets(db) {
    db.dock ||= {};db.dock.queue ||= [];
    let next=Math.max(Number(db.dock.nextQueueNumber)||0,...db.dock.queue.map(e=>Number.isSafeInteger(e.queueNumber)?e.queueNumber:0),...(db.dock.bays||[]).map(b=>Number.isSafeInteger(b.queueNumber)?b.queueNumber:0));
    const used=new Set();
    const sorted=[...db.dock.queue].sort((a,b)=>String(a.createdAt||a.arrivedAt||'').localeCompare(String(b.createdAt||b.arrivedAt||''))||String(a.id).localeCompare(String(b.id)));
    for(const e of sorted) {
        if(!Number.isSafeInteger(e.queueNumber)||e.queueNumber<1||used.has(e.queueNumber))e.queueNumber=++next;
        used.add(e.queueNumber);
    }
    db.dock.nextQueueNumber=next;
}
function board(db,actor,scope='live',at=new Date().toISOString()) {
    if(!actor)throw Object.assign(new Error('กรุณาเข้าสู่ระบบ'),{statusCode:401});
    if(!roles.has(actor.role))throw Object.assign(new Error('ไม่มีสิทธิ์ดูจอคิวหน้าคลัง'),{statusCode:403});
    if(!['live','sit'].includes(scope))throw Object.assign(new Error('scope ต้องเป็น live หรือ sit'),{statusCode:400});
    const selected=house=>isSit(house)===(scope==='sit');
    const jobs=new Map((db.jobs||[]).map(j=>[j.houseNumber,j]));
    const queue=planning.queue(db).filter(e=>selected(e.houseNumber)).map(e=>({
        id:e.id,queueNumber:e.queueNumber||null,position:e.position,queueType:e.queueType,
        houseNumber:e.houseNumber,vehiclePlate:e.vehiclePlate||jobs.get(e.houseNumber)?.vehiclePlate||'ไม่ระบุทะเบียน',
        dockId:null,estimatedWaitMinutes:e.estimatedWaitMinutes,simulation:isSit(e.houseNumber)
    }));
    const called=(db.dock?.bays||[]).filter(b=>b.houseNumber&&selected(b.houseNumber)).map(b=>({
        id:b.id,queueNumber:b.queueNumber||null,queueType:b.queueType||planning.bayKind(b),
        houseNumber:b.houseNumber,vehiclePlate:b.vehiclePlate||jobs.get(b.houseNumber)?.vehiclePlate||'ไม่ระบุทะเบียน',
        dockId:b.id,calledAt:b.assignedAt||null,simulation:isSit(b.houseNumber)
    }));
    called.sort((a,b)=>String(b.calledAt||'').localeCompare(String(a.calledAt||'')));
    const bays=(db.dock?.bays||[]).map(b=>({id:b.id,name:b.name,type:planning.bayKind(b),
        status:b.houseNumber?(selected(b.houseNumber)?'Called':isSit(b.houseNumber)?'SIT':'Occupied'):b.status,
        houseNumber:b.houseNumber&&selected(b.houseNumber)?b.houseNumber:null}));
    return {scope,updatedAt:at,refreshSeconds:10,called,queue,bays};
}
module.exports={ensureInboundBays,ensureTickets,board,isSit};
