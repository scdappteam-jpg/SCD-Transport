// Plan e-mail import rounds (SRS 3.2).
// n8n pushes plan files whenever it finds new mail. With a schedule set, the
// files wait in an inbox and are imported together at each round:
//  fixed     09:00 / 17:00 / 20:00 (Asia/Bangkok) or other set times
//  interval  every 30 or 60 minutes
//  immediate import as soon as a file arrives (the original behaviour, default)
// A queued round is run by the next webhook call or the next desktop load
// after the round time, so files never wait past a round once anyone is online.
"use strict";

const DEFAULT = { mode: "immediate", times: ["09:00", "17:00", "20:00"], intervalMinutes: 30 };
const MAX_INBOX = 40;

function fail(message, statusCode = 422) { throw Object.assign(new Error(message), { statusCode }); }

function config(db) {
    const saved = db.importSchedule || {};
    return { ...DEFAULT, ...saved, times: Array.isArray(saved.times) && saved.times.length ? saved.times : DEFAULT.times };
}

function save(db, actor, payload, now) {
    if (!actor || actor.role !== "Admin") fail("เฉพาะ Admin ตั้งรอบดึงอีเมลได้", 403);
    const mode = payload.mode;
    if (!["immediate", "fixed", "interval"].includes(mode)) fail("รูปแบบรอบไม่ถูกต้อง");
    const times = [...new Set((Array.isArray(payload.times) ? payload.times : DEFAULT.times).map(t => String(t).trim()))].sort();
    if (mode === "fixed" && (!times.length || times.length > 12 || times.some(t => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)))) fail("เวลาต้องอยู่ในรูปแบบ HH:MM และไม่เกิน 12 รอบ");
    const intervalMinutes = Number(payload.intervalMinutes ?? DEFAULT.intervalMinutes);
    if (mode === "interval" && ![30, 60].includes(intervalMinutes)) fail("ดึงอัตโนมัติได้ทุก 30 หรือ 60 นาที");
    db.importSchedule = { ...(db.importSchedule || {}), mode, times, intervalMinutes, updatedAt: now, updatedBy: actor.id };
    return config(db);
}

const bangkokParts = iso => {
    const d = new Date(Date.parse(iso) + 7 * 3600000);
    return { day: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
};
const slotIso = (day, hhmm) => new Date(Date.parse(`${day}T${hhmm}:00+07:00`)).toISOString();

// The latest round time at or before now (fixed) or the next due time (interval).
function lastRoundAt(cfg, now) {
    if (cfg.mode === "fixed") {
        const { day, minutes } = bangkokParts(now);
        const today = cfg.times.filter(t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) <= minutes);
        if (today.length) return slotIso(day, today[today.length - 1]);
        const yesterday = new Date(Date.parse(`${day}T00:00:00+07:00`) - 86400000 + 7 * 3600000).toISOString().slice(0, 10);
        return slotIso(yesterday, cfg.times[cfg.times.length - 1]);
    }
    return null;
}

function nextRoundAt(cfg, db, now) {
    if (cfg.mode === "immediate") return now;
    if (cfg.mode === "interval") {
        const last = db.importScheduleState?.lastRunAt;
        return last ? new Date(Date.parse(last) + cfg.intervalMinutes * 60000).toISOString() : now;
    }
    const { day, minutes } = bangkokParts(now);
    const later = cfg.times.find(t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) > minutes);
    if (later) return slotIso(day, later);
    const tomorrow = new Date(Date.parse(`${day}T00:00:00+07:00`) + 86400000 + 7 * 3600000).toISOString().slice(0, 10);
    return slotIso(tomorrow, cfg.times[0]);
}

function isDue(db, now) {
    const cfg = config(db);
    if (cfg.mode === "immediate") return true;
    const last = db.importScheduleState?.lastRunAt;
    if (!last) return true;
    if (cfg.mode === "interval") return Date.parse(now) - Date.parse(last) >= cfg.intervalMinutes * 60000;
    return Date.parse(lastRoundAt(cfg, now)) > Date.parse(last);
}

function enqueue(db, attachments, meta, now) {
    db.importInbox ||= [];
    for (const att of attachments || []) {
        if (db.importInbox.length >= MAX_INBOX) break;
        db.importInbox.push({ ...att, receivedAt: now, subject: String(meta.subject || "").slice(0, 200), from: String(meta.from || "").slice(0, 120) });
    }
    return db.importInbox.length;
}

function drain(db, now) {
    const items = db.importInbox || [];
    db.importInbox = [];
    db.importScheduleState = { ...(db.importScheduleState || {}), lastRunAt: now, lastRunFiles: items.length };
    return items;
}

function status(db, now) {
    const cfg = config(db);
    return { ...cfg, waitingFiles: (db.importInbox || []).length, lastRunAt: db.importScheduleState?.lastRunAt || null, nextRunAt: nextRoundAt(cfg, db, now) };
}

module.exports = { DEFAULT, config, save, isDue, enqueue, drain, status, nextRoundAt };
