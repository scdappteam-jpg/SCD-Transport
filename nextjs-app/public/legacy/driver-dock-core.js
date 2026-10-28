(function(root,factory){
    const core=factory();
    if(typeof module==='object'&&module.exports)module.exports=core;
    else root.DriverDock=core;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
    const finished=new Set(['Billed','Completed','Cancelled','Rejected','PassCPOut','ReadyForBilling','BillingReviewed','InvoiceDrafted','InvoiceSent','TerminalArrived']);
    const active=job=>job&&!finished.has(job.status);
    const ticket=value=>Number.isSafeInteger(value)&&value>0?String(value).padStart(3,'0'):'—';
    function select(jobs,selected='',remembered='',unlocked=''){
        const eligible=jobs.filter(active);
        for(const house of [selected,remembered,unlocked]){
            const match=eligible.find(j=>j.houseNumber===house);
            if(match)return match;
        }
        return eligible.find(j=>j.driverDock?.phase==='Called')||eligible.find(j=>j.driverDock?.phase==='Waiting')||eligible[0]||null;
    }
    function project(job,dock){
        const bay=(dock?.bays||[]).find(b=>b.houseNumber===job.houseNumber&&b.status==='Occupied');
        const entry=active(job)?(dock?.queue||[]).find(e=>e.houseNumber===job.houseNumber):null;
        return {...job,driverDock:bay?{phase:'Called',bayId:bay.id,bayName:bay.name,queueNumber:bay.queueNumber||null}:entry?{phase:'Waiting',bayId:null,queueNumber:entry.queueNumber||null}:{phase:'None',bayId:null,queueNumber:null}};
    }
    function lookup(board,house,plate,allowed){
        const match=row=>(!allowed||allowed.has(row.houseNumber))&&(house?row.houseNumber===house:!!plate&&row.vehiclePlate===plate);
        return {bay:board.bays.find(match)||null,queue:board.queue.find(match)||null};
    }
    return {active,ticket,select,project,lookup};
});
