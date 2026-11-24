(function (root) {
    function identity(job) {
        const explicit = job.transportRoundId || job.pickupBatchId || job.batchId;
        if (explicit) return {id: explicit, source: 'explicit'};
        if (job.driverId && job.vehiclePlate && job.routeStartedAt && Number.isFinite(Date.parse(job.routeStartedAt))) {
            return {id: JSON.stringify(['driver-start', job.driverId, job.vehiclePlate, new Date(job.routeStartedAt).toISOString()]), source: 'driver-start'};
        }
        return {id: '', source: ''};
    }
    function billingKey(job) {
        const round = identity(job).id || job.billingTripId;
        return round ? `${job.workDate || job.pickupDate || ''}|${round}` : null;
    }
    const api = {identity, billingKey};
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.TransportRounds = api;
})(typeof window !== 'undefined' ? window : globalThis);
