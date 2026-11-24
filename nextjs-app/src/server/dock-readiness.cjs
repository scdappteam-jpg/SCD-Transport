/* eslint-disable @typescript-eslint/no-require-imports -- shared server-only CommonJS domain service */
// Shared physical readiness for both automatic and manual inbound calls.
const groups = require('./dock-vehicle-group.cjs');
function ready(db, entry) {
    if (!entry || entry.autoDispatchPaused || entry.queueType === 'Outbound') return false;
    const houses = groups.houses(entry), rows = groups.forHouses(db, houses);
    if (!rows.length || rows.length !== houses.length) return false;
    if (rows.some(row => groups.jobs(db, row).some(job => !houses.includes(job.houseNumber)))) return false;
    if (new Set(rows.map(row => row.driverId)).size !== 1) return false;
    const plates = new Set(rows.map(row => String(row.vehiclePlate || '').normalize('NFKC').toUpperCase().replace(/[\s-]/g, '')));
    if (plates.size !== 1 || plates.has('')) return false;
    return rows.every(job => job.status === 'WaitingForDock' && !job.csRejected && job.csConfirmed && job.cargoIssuedAt && job.driverId &&
        Number.isFinite(Date.parse(job.arrivedWh3At)) && Number.isFinite(Date.parse(job.releaseDocumentReceivedAt)) && !job.wh3UnloadCompletedAt);
}
module.exports = {ready};
