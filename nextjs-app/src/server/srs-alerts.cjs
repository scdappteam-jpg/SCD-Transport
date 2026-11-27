// Targeted operational alerts (SRS 4.1.3, 4.3.1, 4.4.2).
// Alerts still go through the shared createAlert (dashboard + LINE). This adds
// who must act (`audience` roles), the House, a kind for filtering, and an
// optional e-mail via ALERT_EMAIL_WEBHOOK_URL.
"use strict";

const AVG_KMH = 35;          // city/expressway mix, used only for an estimate
const ROAD_FACTOR = 1.3;     // straight line → road distance

function parseGps(text) {
    const [lat, lon] = String(text || "").split(",").map(Number);
    return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0) ? { lat, lon } : null;
}

function distanceKm(a, b) {
    const r = value => value * Math.PI / 180;
    const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

// WH3 point: the active check-in location named WH3 (or the first active one).
function wh3Point(db) {
    const points = (db.hr?.checkInLocations || []).filter(l => l.active !== false && Number.isFinite(Number(l.latitude)) && Number.isFinite(Number(l.longitude)));
    const wh3 = points.find(l => /wh\s*3/i.test(`${l.id} ${l.name || ""}`)) || points[0];
    return wh3 ? { lat: Number(wh3.latitude), lon: Number(wh3.longitude), name: wh3.name || wh3.id } : null;
}

function etaToWh3(db, gpsText, nowIso) {
    const from = parseGps(gpsText), to = wh3Point(db);
    if (!from || !to) return null;
    const km = distanceKm(from, to) * ROAD_FACTOR;
    const minutes = Math.max(5, Math.round(km / AVG_KMH * 60));
    return { distanceKm: Math.round(km * 10) / 10, minutes, etaAt: new Date(Date.parse(nowIso) + minutes * 60000).toISOString(), to: to.name };
}

const bangkokTime = iso => new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

async function emailAlert(alert) {
    const url = process.env.ALERT_EMAIL_WEBHOOK_URL;
    if (!url || alert.simulation) { alert.emailStatus = url ? "SuppressedSimulation" : "NotConfigured"; return; }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
            body: JSON.stringify({ subject: `[SCD] ${alert.title || alert.message}`.slice(0, 160), message: alert.message, roles: alert.audience, houseNumber: alert.houseNumber || "" }) });
        alert.emailStatus = res.ok ? "Sent" : `Failed ${res.status}`;
    } catch (error) {
        alert.emailStatus = error.name === "AbortError" ? "Timeout" : "Failed";
    } finally { clearTimeout(timer); }
}

async function notify(db, createAlert, { message, severity = "warning", roles, houseNumber = "", kind, title = "" }) {
    const alert = await createAlert(db, message, severity);
    Object.assign(alert, { audience: roles, kind, title, ...(houseNumber ? { houseNumber } : {}) });
    await emailAlert(alert);
    return alert;
}

const houseList = jobs => [...new Set(jobs.map(j => j.houseNumber))].join(", ");
const plates = jobs => [...new Set(jobs.map(j => j.vehiclePlate).filter(Boolean))].join(", ") || "-";

// Step 1: truck left the customer (pickup complete) → Shipping/EI start documents.
async function leftFactory(db, createAlert, jobs, payload, nowIso) {
    const eta = etaToWh3(db, `${payload.gpsLat},${payload.gpsLong}`, nowIso);
    for (const job of jobs) job.etaWh3At = eta?.etaAt || job.etaWh3At;
    const etaText = eta ? `ETA ถึง ${eta.to} ประมาณ ${bangkokTime(eta.etaAt)} น. (~${eta.distanceKm} กม.)` : "ยังคำนวณ ETA ไม่ได้ (ไม่มีพิกัดคลัง)";
    return notify(db, createAlert, { kind: "EI-Step1", title: "รถออกจากโรงงาน", severity: "info", roles: ["EI_Customer", "CS", "Admin"], houseNumber: jobs[0]?.houseNumber,
        message: `สเต็ป 1: รถ ${plates(jobs)} ออกจากโรงงานแล้ว · House ${houseList(jobs)} · ${etaText} · Shipping เริ่มเตรียมเอกสาร` });
}

// Step 2: truck arrived at the airport / WH3 → Shipping/EI file the release document.
async function arrivedAirport(db, createAlert, jobs) {
    return notify(db, createAlert, { kind: "EI-Step2", title: "รถถึงสนามบิน", severity: "warning", roles: ["EI_Customer", "Admin"], houseNumber: jobs[0]?.houseNumber,
        message: `สเต็ป 2: รถ ${plates(jobs)} ถึงสนามบิน/WH3 แล้ว · House ${houseList(jobs)} · Shipping นำเอกสารไปยื่นตรวจปล่อย` });
}

async function holdOpened(db, createAlert, job, hold) {
    return notify(db, createAlert, { kind: "WH-Hold", title: "สินค้าถูกพัก", severity: "danger", roles: ["WH3_TeamLeader", "Admin"], houseNumber: job.houseNumber,
        message: `สินค้าถูกพัก (${hold?.kind || "Hold"}) House ${job.houseNumber}${hold?.reason ? ` · ${hold.reason}` : ""} · หัวหน้าคลังตรวจและปลดพัก` });
}

async function reXray(db, createAlert, job) {
    return notify(db, createAlert, { kind: "XRay-Rescan", title: "ต้อง Re-X-Ray", severity: "danger", roles: ["WH3_TeamLeader", "Admin"], houseNumber: job.houseNumber,
        message: `ต้อง Re-X-Ray: ${job.houseNumber} / Flight ${job.flightNo || "-"} · หัวหน้าคลังจัดคนสนับสนุนหน้างาน` });
}

// Alerts a viewer should see as a pop-up: addressed to their role.
function forViewer(alerts, role) {
    return (alerts || []).filter(alert => !Array.isArray(alert.audience) || alert.audience.includes(role) || role === "Executive");
}

module.exports = { parseGps, distanceKm, wh3Point, etaToWh3, notify, leftFactory, arrivedAirport, holdOpened, reXray, forViewer };
