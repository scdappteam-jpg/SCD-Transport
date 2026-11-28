// Accounting "Match" (SRS 4.5.2): when the physical documents arrive,
// accounting compares them with the photos in the system and marks the House
// as matched. A House cannot be reviewed for billing until it is matched.
// "Not matched" records what differs, so the gap can be chased.
"use strict";

const ROLES = ["Billing", "Admin", "Executive"];

function fail(message, statusCode = 422) { throw Object.assign(new Error(message), { statusCode }); }

function match(db, actor, payload, now) {
    if (!actor || !ROLES.includes(actor.role)) fail("เฉพาะฝ่ายบัญชีหรือ Admin กด Match เอกสารได้", 403);
    const houses = [...new Set((Array.isArray(payload.houseNumbers) ? payload.houseNumbers : [payload.houseNumber]).map(h => String(h || "").trim()).filter(Boolean))];
    if (!houses.length) fail("กรุณาเลือก House");
    const jobs = houses.map(house => (db.jobs || []).find(job => job.houseNumber === house));
    if (jobs.some(job => !job)) fail("ไม่พบ House ที่เลือก", 404);
    const matched = payload.matched !== false;
    const note = String(payload.note || "").trim().slice(0, 500);
    if (!matched && note.length < 5) fail("เอกสารไม่ตรง ต้องระบุว่าต่างกันตรงไหน");
    for (const job of jobs) {
        job.physicalDocMatch = { matched, note, by: actor.id, byName: actor.name || "", at: now };
        job.physicalDocMatchHistory = [...(job.physicalDocMatchHistory || []), job.physicalDocMatch].slice(-20);
        job.updatedAt = now;
    }
    return jobs;
}

const isMatched = job => job?.physicalDocMatch?.matched === true;

module.exports = { ROLES, match, isMatched };
