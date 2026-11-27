// Warehouse scan geofence (SRS 3.4). Optional and OFF by default: when an
// Admin turns it on, warehouse staff may scan / move goods only after a
// check-in today taken within the radius (default 100 m) of a configured
// check-in location. Admin / Executive are never blocked.
"use strict";

const STAFF = new Set(["WH_Staff", "WH3_TeamLeader", "Tagging_Staff", "QA_Inspector", "Check_House"]);
const DEFAULT_RADIUS = 100;

function fail(message, statusCode = 403) { throw Object.assign(new Error(message), { statusCode }); }

function settings(db) {
    const cfg = db.meetingSafety || {};
    const radius = Number(cfg.warehouseScanRadiusMeters);
    return { enabled: cfg.warehouseScanGeofence === true, radiusMeters: Number.isFinite(radius) && radius >= 20 && radius <= 5000 ? radius : DEFAULT_RADIUS };
}

function distanceMeters(lat1, lon1, lat2, lon2) {
    const r = v => v * Math.PI / 180;
    const h = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
    return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

const bangkokDay = iso => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });

function enforce(db, actor, nowIso) {
    const { enabled, radiusMeters } = settings(db);
    if (!enabled || !actor || !STAFF.has(actor.role)) return null;
    const points = (db.hr?.checkInLocations || []).filter(l => l.active !== false && Number.isFinite(Number(l.latitude)) && Number.isFinite(Number(l.longitude)));
    if (!points.length) fail("เปิดบังคับรัศมีคลังแล้ว แต่ยังไม่ได้ตั้งพิกัดคลัง กรุณาให้ Admin ตั้งพิกัดจุดเช็คอิน", 409);
    const today = bangkokDay(nowIso);
    const open = (db.attendance || []).filter(r => r.userId === actor.id && r.date === today && !r.checkOutTime && r.isSimulation !== true && Number.isFinite(Number(r.checkInLat)) && Number.isFinite(Number(r.checkInLon)));
    if (!open.length) fail(`ต้องลงเวลาเข้างานในรัศมี ${radiusMeters} ม. จากคลังก่อนสแกนหรือย้ายสินค้า`);
    const best = Math.min(...open.flatMap(r => points.map(l => distanceMeters(Number(r.checkInLat), Number(r.checkInLon), Number(l.latitude), Number(l.longitude)))));
    if (best > radiusMeters) fail(`ลงเวลาเข้างานห่างคลัง ${Math.round(best)} ม. (กำหนด ${radiusMeters} ม.) สแกน/ย้ายสินค้าไม่ได้`);
    return { distanceMeters: Math.round(best), radiusMeters };
}

// Settings save: validate the optional fields; keep the current value when absent.
function readSettings(db, p) {
    const current = settings(db);
    const enabled = p.warehouseScanGeofence === undefined ? current.enabled : p.warehouseScanGeofence;
    const radius = p.warehouseScanRadiusMeters === undefined ? current.radiusMeters : Number(p.warehouseScanRadiusMeters);
    if (typeof enabled !== "boolean") fail("ค่าบังคับรัศมีคลังไม่ถูกต้อง", 422);
    if (!Number.isFinite(radius) || radius < 20 || radius > 5000) fail("รัศมีคลังต้องอยู่ระหว่าง 20–5000 เมตร", 422);
    if (enabled && !(db.hr?.checkInLocations || []).some(l => l.active !== false)) fail("ตั้งพิกัดจุดเช็คอินใน HR ก่อนเปิดบังคับรัศมีคลัง", 422);
    return { warehouseScanGeofence: enabled, warehouseScanRadiusMeters: radius };
}

module.exports = { STAFF, DEFAULT_RADIUS, settings, enforce, readSettings, distanceMeters };
