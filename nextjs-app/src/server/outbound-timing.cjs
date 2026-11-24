// Shared milestones for the legacy shipping UI and Operations Control.
// Never infer loading start or queue receipt from an approval or old status.
function booking(job, payload) {
    return Object.fromEntries(['vehiclePlate','driverName','vehicleModel','vehicleType'].map(key => {
        const field = 'aot' + key[0].toUpperCase() + key.slice(1);
        return [field, String(payload[key] || '').trim() || job[field] || ''];
    }));
}
function prepare(job, payload, at) {
    const fail = message => { const error = new Error(message); error.statusCode = 409; throw error; };
    if (job.invoiceId || job.readyForBilling || job.terminalClosedAt) fail('งานปิด Terminal หรือเข้าวางบิลแล้ว ห้ามบันทึกเวลาย้อนขั้น');
    if (payload.phase && !['wh3-load-start','queue'].includes(payload.phase)) fail('ขั้นตอนเวลาไม่ถูกต้อง');
    if (payload.phase === 'wh3-load-start') {
        if (job.wh3LoadingStartedAt) return { idempotent: true, patch: {} };
        if (job.goodsLoadedAt || job.terminalArrivedAt) fail('รถออก WH3 แล้ว ไม่สามารถเริ่มโหลดหรือเติมเวลาแทนได้');
        return { patch: { wh3LoadingStartedAt: at }, activity: 'WH3LoadStarted' };
    }
    if (payload.phase === 'queue') {
        if (job.queueReceivedAt) return { idempotent: true, patch: {} };
        if (job.weighStartedAt) fail('เริ่มชั่งแล้ว ไม่สามารถเติมเวลารับคิวย้อนหลังได้');
        return { patch: { queueReceivedAt: at }, activity: 'TerminalQueueReceived' };
    }
    if (payload.arrived) return { patch: { cargoReceivedAt: job.cargoReceivedAt || at, terminalArrivedAt: job.terminalArrivedAt || at, driverRouteStatus: 'TerminalArrived' } };
    return { patch: { releasedWh3At: job.releasedWh3At || at, goodsLoadedAt: job.goodsLoadedAt || at, driverRouteStatus: 'EnRouteToTerminal' } };
}
function xray(job, payload, at) {
    const repeat=Boolean(job.requiresRescan || job.xrayStatus==='Hold' || job.status==='ReXRayRequired');
    const started=repeat?'reXrayStartedAt':'xrayStartedAt';
    const completed=repeat?'reXrayCompletedAt':'xrayCompletedAt';
    const patch={[completed]:at};
    // A result confirms completion only. Never invent a start when none was recorded.
    if (job[started]) patch[started]=job[started];
    if(repeat) patch.xrayCompletedAt=job.xrayCompletedAt || null;
    return patch;
}
module.exports = { booking, prepare, xray };
