// Planning is separate from physical receipt and putaway. Never change a job
// while building this list; existing reservation metadata remains authoritative.
function selectableJobs(jobs) {
    const finished = new Set(['Cancelled','Stored','ReadyForTerminal','TerminalArrived','Delivered','Billed','InvoiceSent','ReadyForBilling']);
    return (jobs || []).filter(job => {
        if (!job.csConfirmed || job.csRejected || finished.has(job.status)) return false;
        if (job.locationId || job.warehouseZoneId || job.inboundClosedAt || job.terminalArrivedAt) return false;
        const route = String(job.routeType || job.destination || 'WH3').trim().toUpperCase();
        return route === 'WH3';
    });
}
module.exports = {selectableJobs};
