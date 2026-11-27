// Pickup count check: compares what the driver actually received per House
// against the planned piece count. A difference is allowed (short / over
// shipments happen) but the driver must say why, so CS and WH3 can follow up.
"use strict";

function plannedOf(job) {
    const n = Number(job?.plannedPieceCount ?? job?.pieceCount);
    return Number.isFinite(n) && n > 0 ? n : null;
}

// rows: normalized pickup rows [{houseNumber, carton}]
function mismatches(jobs, rows) {
    const out = [];
    for (const job of jobs || []) {
        const planned = plannedOf(job);
        if (planned === null) continue;
        const row = (rows || []).find(r => r.houseNumber === job.houseNumber);
        const received = Number(row?.carton);
        if (!row || !Number.isFinite(received)) continue;
        if (received !== planned) out.push({ houseNumber: job.houseNumber, planned, received, diff: received - planned });
    }
    return out;
}

function check(jobs, rows, reason) {
    const list = mismatches(jobs, rows);
    const text = String(reason || "").trim();
    if (list.length && text.length < 3) {
        const detail = list.map(m => `${m.houseNumber} แผน ${m.planned} รับจริง ${m.received}`).join(", ");
        const error = new Error(`จำนวนรับไม่ตรงแผน (${detail}) กรุณาระบุเหตุผล`);
        error.statusCode = 422;
        throw error;
    }
    return { mismatches: list, reason: list.length ? text : "" };
}

module.exports = { plannedOf, mismatches, check };
