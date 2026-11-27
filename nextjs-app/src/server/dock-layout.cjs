// WH3 dock layout (SRS 4.2.2): 8 bays, 5 outbound (D1–D5) and 3 inbound
// (D6–D8). Customer Direct deliveries use the inbound bays.
// The previous layout had 11 bays (D8–D11 inbound, D7 Customer Direct). Bays
// D9–D11 stay valid while a truck still occupies them and are removed once
// free, so no truck already at a bay is disrupted by the change.
"use strict";

const OUTBOUND = ["D1", "D2", "D3", "D4", "D5"];
const INBOUND = ["D6", "D7", "D8"];
const LEGACY_INBOUND = ["D9", "D10", "D11"];
const LAYOUT_VERSION = 2;

const num = id => Number(String(id || "").replace(/^D/i, ""));

// Inbound for D6–D11 (D9–D11 only exist until they are freed).
function bayKind(bay) {
    const n = num(bay?.id ?? bay);
    return n >= 6 && n <= 11 ? "Inbound" : "Outbound";
}

// Which bays accept a queue type: Customer Direct ("External") uses inbound bays.
function accepts(bay, type) {
    const kind = bayKind(bay);
    return type === "Outbound" ? kind === "Outbound" : kind === "Inbound";
}

function isInboundBayId(id) {
    return INBOUND.includes(id) || LEGACY_INBOUND.includes(id);
}

function isRetired(bay) {
    return LEGACY_INBOUND.includes(bay?.id);
}

function defaults() {
    return [
        ...OUTBOUND.map((id, i) => ({ id, name: `ท่า ${i + 1}`, zone: i < 3 ? "A" : "B", status: "Available", note: "Outbound" })),
        ...INBOUND.map((id, i) => ({ id, name: `ท่า ${i + 6}`, zone: "WH3", status: "Available", note: "Inbound" }))
    ];
}

const occupied = bay => bay.status !== "Available" || bay.houseNumber || (Array.isArray(bay.houseNumbers) && bay.houseNumbers.length);

// Bring a saved bay list to the 8-bay layout without touching occupied bays.
function needsMigration(db) {
    const bays = Array.isArray(db.dock?.bays) ? db.dock.bays : [];
    if (db.dock?.layoutVersion !== LAYOUT_VERSION || !bays.length) return true;
    const ids = new Set(bays.map(bay => bay.id));
    return [...OUTBOUND, ...INBOUND].some(id => !ids.has(id)) || bays.some(bay => isRetired(bay) && !occupied(bay));
}

function migrate(db) {
    db.dock ||= {};
    if (!needsMigration(db)) return db.dock.bays;
    const bays = Array.isArray(db.dock.bays) ? db.dock.bays : [];
    const byId = new Map(bays.map(bay => [bay.id, bay]));
    const next = defaults().map(base => {
        const saved = byId.get(base.id);
        if (!saved) return base;
        // Keep live state; refresh the label/purpose for the new layout.
        return { ...saved, name: base.name, zone: base.zone, note: occupied(saved) ? saved.note : base.note };
    });
    for (const bay of bays) {
        if (isRetired(bay) && occupied(bay)) next.push({ ...bay, note: "ท่าเดิม · ปิดเมื่อรถออก" });
    }
    db.dock.bays = next;
    db.dock.layoutVersion = LAYOUT_VERSION;
    return next;
}

module.exports = { OUTBOUND, INBOUND, LEGACY_INBOUND, LAYOUT_VERSION, bayKind, accepts, isInboundBayId, isRetired, defaults, migrate };
