(function(root,factory){
    const core=factory();
    if(typeof module==='object'&&module.exports)module.exports=core;
    else root.DriverDock=core;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
    const finished=new Set(['Billed','Completed','Cancelled','Rejected','PassCPOut','ReadyForBilling','BillingReviewed','InvoiceDrafted','InvoiceSent','TerminalArrived']);
    const staleDriverSelection=new Set(['Stored','ReadyForTerminal','Inbound']);
    const active=job=>job&&!finished.has(job.status);
    const driverFinished=new Set(['Billed','Completed','PassCPOut','ReadyForBilling','BillingReviewed','InvoiceDrafted','InvoiceSent']);
    const completedForDriver=job=>driverFinished.has(job?.status)||(job?.driverRouteStatus==='Available'&&Boolean(job?.wh3UnloadCompletedAt||job?.terminalClosedAt));
    const staleSelection=job=>staleDriverSelection.has(job?.status)||Boolean(job?.driverDock?.work?.unloadCompletedAt);
    const ticket=value=>Number.isSafeInteger(value)&&value>0?String(value).padStart(3,'0'):'—';
    function progress(job,bay){
        const events=(job?.driverDockHistory||[]).filter(e=>e.bayId===bay?.id&&e.assignedAt===bay?.assignedAt);
        const time=event=>events.find(e=>e.event===event)?.at||null;
        return {revision:events.length,arrivedAt:time('arrive'),unloadStartedAt:time('unload-start'),unloadCompletedAt:time('unload-complete'),events};
    }
    function select(jobs,selected='',remembered='',unlocked=''){
        const eligible=jobs.filter(active);
        for(const house of [selected,remembered,unlocked]){
            const match=eligible.find(j=>j.houseNumber===house);
            if(match&&!staleSelection(match))return match;
        }
        return eligible.find(j=>j.driverDock?.phase==='Called'&&!staleSelection(j))||eligible.find(j=>j.driverRouteStatus==='ReturningWH3'||j.status==='ReturningWH3')||eligible.find(j=>j.driverDock?.phase==='Waiting')||eligible.find(j=>!staleSelection(j))||eligible[0]||null;
    }
    function project(job,dock){
        const bay=(dock?.bays||[]).find(b=>b.houseNumber===job.houseNumber&&b.status==='Occupied');
        const entry=active(job)?(dock?.queue||[]).find(e=>e.houseNumber===job.houseNumber):null;
        const work=bay?progress(job,bay):null;
        return {...job,driverDock:bay?{phase:'Called',bayId:bay.id,bayName:bay.name,queueNumber:bay.queueNumber||null,...work?.revision?{work}:{}}:entry?{phase:'Waiting',bayId:null,queueNumber:entry.queueNumber||null}:{phase:'None',bayId:null,queueNumber:null}};
    }
    function lookup(board,house,plate,allowed){
        const match=row=>(!allowed||allowed.has(row.houseNumber))&&(house?row.houseNumber===house:!!plate&&row.vehiclePlate===plate);
        return {bay:board.bays.find(match)||null,queue:board.queue.find(match)||null};
    }
    function nextQueueAction(job){
        const states=new Set([job?.driverRouteStatus,job?.status]);
        if(states.has('ReturningWH3'))return 'arrive-wh3';
        if(states.has('ArrivedWH3')||states.has('AwaitingReleaseDocument'))return 'await-release';
        if(states.has('ReleasedForDock')||states.has('WaitingForDock'))return 'join-queue';
        return 'not-ready';
    }
    return {active,completedForDriver,ticket,select,project,lookup,progress,nextQueueAction};
});
