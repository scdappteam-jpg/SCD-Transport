// A production SIT allowlist must never turn safety rules on for live jobs.
function active(db, jobs=[]) {
    if (db.meetingSafety?.enabled) return true;
    const allowed=new Set(db.meetingSafety?.sitHouseNumbers||[]);
    return jobs.length>0 && jobs.every(j=>j && /^SIT[-A-Z0-9]/i.test(j.houseNumber||'') && allowed.has(j.houseNumber));
}
function jobs(db,p={}) {
    let houses=p.houseNumbers||p.houses||(p.houseNumber?[p.houseNumber]:[]);
    if(typeof houses==='string') houses=houses.split(/[\s,;]+/).filter(Boolean);
    return Array.isArray(houses)?houses.map(h=>db.jobs.find(j=>j.houseNumber===h)):[];
}
function scoped(db) {
    if(db.meetingSafety?.enabled)return db;
    return {...db,jobs:db.jobs.filter(j=>active(db,[j])),dock:{...db.dock,queue:(db.dock?.queue||[]).filter(e=>active(db,[db.jobs.find(j=>j.houseNumber===e.houseNumber)]))}};
}
function queue(db,planner) {
    if(db.meetingSafety?.enabled)return planner(db);
    const planned=new Map(planner(scoped(db)).map(e=>[e.houseNumber,e]));
    return (db.dock?.queue||[]).map(e=>planned.get(e.houseNumber)||e);
}
module.exports={active,jobs,scoped,queue};
