/* eslint-disable @typescript-eslint/no-require-imports -- server-only CommonJS domain service */
// QR link for subcontractor / customer-owned trucks (SRS 6).
// Staff create a link for one truck and its Houses. The holder (no login) can
// see only that truck: each House's step, dock queue or bay, and can report
// "arrived at WH3", which alerts the warehouse and Transport but does not move
// any workflow step. Links expire (default 48 h, max 72 h) and can be revoked.
// Only a hash of the token is stored.
"use strict";

const crypto = require("node:crypto");
const planning = require("./dock-planning.cjs");
const groups = require("./dock-vehicle-group.cjs");

const CREATE_ROLES = ["Admin", "Executive", "Team_Transport", "WH3_TeamLeader", "WH_Staff"];
const STEP_LABEL = {
    Pending: "รอรับสินค้า", Assigned: "จัดรถแล้ว", ArrivedAtPickup: "ถึงจุดรับ", Loading: "กำลังโหลด", PickedUp: "รับสินค้าแล้ว",
    ReturningWH3: "กำลังมา WH3", AwaitingReleaseDocument: "ถึง WH3 รอใบตรวจปล่อย", WaitingForDock: "รอเข้าท่า",
    ReceivedAtWH3: "ลงสินค้าแล้ว", InboundOpened: "กำลังตรวจรับ", Stored: "จัดเก็บแล้ว", Cancelled: "ยกเลิก"
};

function fail(message, statusCode = 422) { throw Object.assign(new Error(message), { statusCode }); }
const hash = token => crypto.createHash("sha256").update(String(token || "")).digest("hex");

function create(db, actor, payload, now) {
    if (!actor || !CREATE_ROLES.includes(actor.role)) fail("ไม่มีสิทธิ์สร้าง QR สำหรับรถร่วม", 403);
    const houses = [...new Set((Array.isArray(payload.houseNumbers) ? payload.houseNumbers : [payload.houseNumber]).map(h => String(h || "").trim()).filter(Boolean))];
    if (!houses.length || houses.length > 20) fail("เลือก House 1 ถึง 20 รายการ");
    const missing = houses.filter(house => !(db.jobs || []).some(job => job.houseNumber === house));
    if (missing.length) fail(`ไม่พบ House: ${missing.join(", ")}`, 404);
    const plate = String(payload.vehiclePlate || "").trim().slice(0, 40);
    if (!plate) fail("กรอกทะเบียนรถ");
    const hours = Math.min(72, Math.max(1, Number(payload.hours) || 48));
    const token = crypto.randomBytes(24).toString("base64url");
    const link = {
        id: `TL-${crypto.randomUUID()}`, tokenHash: hash(token), houseNumbers: houses, vehiclePlate: plate,
        driverName: String(payload.driverName || "").trim().slice(0, 80), company: String(payload.company || "").trim().slice(0, 120),
        createdBy: actor.id, createdAt: now, expiresAt: new Date(Date.parse(now) + hours * 3600000).toISOString(), revokedAt: null, events: []
    };
    db.truckLinks = [...(db.truckLinks || []).filter(item => Date.parse(item.expiresAt) > Date.parse(now) - 30 * 86400000), link].slice(-500);
    return { link: publicMeta(link), token };
}

function publicMeta(link) {
    return Object.fromEntries(Object.entries(link).filter(([key]) => key !== "tokenHash"));
}

function active(db, token, now) {
    const link = (db.truckLinks || []).find(item => item.tokenHash === hash(token));
    if (!link) fail("ลิงก์ไม่ถูกต้อง", 404);
    if (link.revokedAt) fail("ลิงก์นี้ถูกยกเลิกแล้ว ติดต่อเจ้าหน้าที่", 410);
    if (Date.parse(link.expiresAt) <= Date.parse(now)) fail("ลิงก์หมดอายุแล้ว ติดต่อเจ้าหน้าที่", 410);
    return link;
}

function view(db, token, now) {
    const link = active(db, token, now);
    const queue = planning.queue(db);
    const houses = link.houseNumbers.map(house => {
        const job = (db.jobs || []).find(item => item.houseNumber === house) || {};
        const bay = (db.dock?.bays || []).find(item => groups.contains(item, house) && item.status === "Occupied");
        const entry = queue.find(item => groups.contains(item, house));
        return {
            houseNumber: house, pieces: [job.pieceCount, job.packageType].filter(Boolean).join(" "),
            step: STEP_LABEL[job.status] || job.status || "-",
            dock: bay ? `เข้าท่า ${bay.id}` : entry ? `คิวที่ ${entry.position} รอประมาณ ${entry.estimatedWaitMinutes} นาที` : "",
            etaWh3At: job.etaWh3At || ""
        };
    });
    return { vehiclePlate: link.vehiclePlate, driverName: link.driverName, company: link.company, expiresAt: link.expiresAt, arrivedReportedAt: link.arrivedReportedAt || null, houses };
}

function reportArrived(db, token, payload, now) {
    const link = active(db, token, now);
    const lat = Number(payload.gpsLat), lon = Number(payload.gpsLong);
    const gps = Number.isFinite(lat) && Number.isFinite(lon) ? `${lat},${lon}` : "";
    link.arrivedReportedAt = now;
    link.events = [...(link.events || []), { at: now, type: "arrived", gps }].slice(-20);
    return link;
}

function revoke(db, actor, id, now) {
    if (!actor || !CREATE_ROLES.includes(actor.role)) fail("ไม่มีสิทธิ์ยกเลิกลิงก์", 403);
    const link = (db.truckLinks || []).find(item => item.id === id);
    if (!link) fail("ไม่พบลิงก์", 404);
    link.revokedAt = now;
    link.revokedBy = actor.id;
    return publicMeta(link);
}

function list(db, actor, now) {
    if (!actor || !CREATE_ROLES.includes(actor.role)) fail("ไม่มีสิทธิ์ดูลิงก์รถร่วม", 403);
    return (db.truckLinks || []).filter(item => !item.revokedAt && Date.parse(item.expiresAt) > Date.parse(now)).map(publicMeta).reverse();
}

module.exports = { CREATE_ROLES, hash, create, view, reportArrived, revoke, list };
