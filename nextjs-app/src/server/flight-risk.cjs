/* eslint-disable @typescript-eslint/no-require-imports -- Shared compatibility service. */
const core = require('../../public/legacy/flight-risk-core/index.js');
const receipts = require('./inbound-receipts.cjs');
const ALERT_STATUSES = new Set(['DueToday', 'Warning', 'Urgent', 'Critical', 'Breached']);
const TERMINAL_STATUSES = new Set(['TerminalArrived', 'WeightDimensionRecorded', 'XRayPassed', 'PackingConsolidation', 'ReadyForBilling', 'BillingReviewed', 'InvoiceDrafted', 'InvoiceSent', 'Billed']);
const INACTIVE_STATUSES = new Set(['Cancelled', 'Completed', 'Rejected']);
const bangkokDate = time => new Date(time + 7 * 3600000).toISOString().slice(0, 10);
const usableTime = value => {
    const ms = value ? Date.parse(value) : NaN;
    return Number.isFinite(ms) && new Date(ms).getUTCFullYear() >= 2000 ? ms : null;
};
function derive(job, now = Date.now()) {
    const flightNo = String(job.flightNo || '').trim().toUpperCase();
    const match = flightNo.match(/^[A-Z]{1,3}[-\s]*([0-9]{3,4})(?![0-9])/);
    const etd = usableTime(job.flightTime), cutoff = usableTime(job.cargoCutoffAt);
    const slaDue = etd === null ? null : etd - 14 * 3600000;
    const cutoffDue = cutoff === null ? null : cutoff - 3600000;
    const due = slaDue === null ? cutoffDue : cutoffDue === null ? slaDue : Math.min(slaDue, cutoffDue);
    // Keep full precision at the 2h/4h boundaries and immediately after expiry.
    const minutes = due === null ? null : (due - now) / 60000;
    const mustNotMiss = core.noMiss(job);
    let status = core.level(minutes, mustNotMiss, due !== null && bangkokDate(due) === bangkokDate(now));
    const reasons = { Unclassified: 'ยังไม่มี ETD หรือ Cutoff ที่ใช้คำนวณกำหนดได้', OnTrack: 'Within flight SLA', DueToday: 'WH3 receipt is due today', Warning: 'Within 6 hours of WH3 deadline', Urgent: 'Within 4 hours of WH3 deadline', Critical: mustNotMiss ? 'C/K no-miss job is within 4 hours of WH3 deadline' : 'Within 2 hours of WH3 deadline', Breached: 'WH3 deadline has passed; confirmed receipt is incomplete' };
    let reason = reasons[status];
    if (INACTIVE_STATUSES.has(job.status)) { status = 'Inactive'; reason = 'Job is cancelled or completed'; }
    else if (TERMINAL_STATUSES.has(job.status)) { status = 'TerminalReached'; reason = 'Cargo has reached the terminal workflow'; }
    else if (receipts.house(job).complete) { status = 'WH3Received'; reason = 'Confirmed receipt matches every planned unit'; }
    const iso = value => value === null ? '' : new Date(value).toISOString();
    return { flightNumberDigits: match ? match[1].length : null, slaProfile: etd === null && cutoff !== null ? 'CARGO_CUTOFF' : 'WH3_14H', slaHoursBeforeFlight: 14, mustNotMissFlight: mustNotMiss, airportDueAt: iso(slaDue === null ? due : slaDue), effectiveAirportDueAt: iso(due), wh3DueAt: iso(due), minutesToAirportDue: minutes, flightRiskStatus: status, flightRiskReason: reason };
}
function refresh(db, { now = Date.now(), formatTime = value => value } = {}) {
    db.alerts ||= [];
    let changed = false;
    for (const job of db.jobs || []) {
        const risk = derive(job, now), previousKey = job.flightRiskAlertKey || '';
        Object.assign(job, risk);
        const dueToday = risk.effectiveAirportDueAt && bangkokDate(Date.parse(risk.effectiveAirportDueAt)) === bangkokDate(now);
        const key = `${risk.flightRiskStatus}|${risk.effectiveAirportDueAt}`;
        if (ALERT_STATUSES.has(risk.flightRiskStatus) && (dueToday || ['Urgent', 'Critical', 'Breached', 'Warning'].includes(risk.flightRiskStatus)) && previousKey !== key) {
            db.alerts.push({ id: `FLIGHT-RISK-${job.houseNumber}-${now}-${db.alerts.length}`, message: `[Flight Risk] ${job.houseNumber} · ${job.flightNo || 'TBC'} · ${risk.flightRiskStatus}: ${risk.flightRiskReason}. ต้องยืนยันรับครบที่ WH3 ภายใน ${formatTime(risk.effectiveAirportDueAt)}${risk.mustNotMissFlight ? ' · C/K NO-MISS' : ''}`, severity: ['Critical', 'Breached'].includes(risk.flightRiskStatus) ? 'danger' : 'warning', createdAt: new Date(now).toISOString(), houseNumber: job.houseNumber, flightRiskStatus: risk.flightRiskStatus });
            job.flightRiskAlertKey = key;
            changed = true;
        }
        if (!ALERT_STATUSES.has(risk.flightRiskStatus) && previousKey) { job.flightRiskAlertKey = ''; changed = true; }
    }
    return changed;
}
module.exports = { derive, refresh, ALERT_STATUSES, ...core };
