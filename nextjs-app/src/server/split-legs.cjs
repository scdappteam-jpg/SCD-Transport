// Split House: one House carried by several trucks ("legs").
//
// The job record stays the single House record that WH3, CS, dashboards and
// billing read. `job.splitLegs` holds one entry per truck with that truck's
// driver, plate, planned cartons, batch/round and its own pickup progress.
// Driver actions run on a leg view: a Proxy that reads House data from the job
// and reads/writes truck fields on the leg, so the existing pickup handlers
// work unchanged. After each change `syncHouse` rolls the legs up into the
// House fields: the House is only as far along as its slowest truck, so it is
// PickedUp when every truck finished pickup and AwaitingReleaseDocument when
// every truck reached WH3.
"use strict";

const LEG_FIELDS = new Set([
    "driverId", "driverName", "vehiclePlate", "batchId", "transportRoundId", "pickupBatchId",
    "status", "driverRouteStatus", "pieceCount", "plannedPieceCount", "pickupItems",
    "routeStartedAt", "routeStartGps", "startPlace", "checkInAt", "arrivedAtPickupAt", "checkInGps",
    "pickupPausedAt", "pickupPauseReason", "pickupPauseNote", "pickupPauseLog", "pickupPaused",
    "loadedAt", "loadedGps", "pickupLoadFingerprint", "pickupChecklist", "pickupCase", "stickerColor", "packageType",
    "safetyPickupEvidenceFingerprint", "safetyPickupEvidenceFileIds", "pickupPhotoRecordedAt",
    "inspectorName", "receiverName", "endPlace", "destination", "routeNextModule", "routeComplianceStatus",
    "completedAt", "completeGps", "pickupCompletionFingerprint", "pickupReceivedCount", "pickupCountMismatch",
    "doorClosedPhotoAt", "returningWh3At", "arrivedWh3At", "arrivedWh3Gps", "updatedAt"
]);

// Order of a truck's progress; the House takes the lowest across trucks.
const STATUS_RANK = ["Pending", "Assigned", "EnRouteToPickup", "ArrivedAtPickup", "Loading", "PickedUp", "ReturningWH3", "AwaitingReleaseDocument"];
const ROUTE_RANK = ["", "Assigned", "EnRouteToPickup", "ArrivedAtPickup", "Loading", "ReturningWH3", "ArrivedWH3"];

function isSplit(job) {
    return Array.isArray(job?.splitLegs) && job.splitLegs.length > 1;
}

function legView(job, leg) {
    const view = new Proxy(job, {
        get(target, key) {
            if (key === "splitLegId") return leg.legId;
            if (key === "splitLegIndex") return job.splitLegs.indexOf(leg) + 1;
            if (key === "splitLegCount") return job.splitLegs.length;
            if (key === "splitTotalPieceCount") return target.pieceCount;
            if (key === "__splitParent") return target;
            if (key === "__splitLeg") return leg;
            if (typeof key === "string" && LEG_FIELDS.has(key)) return leg[key];
            return target[key];
        },
        set(target, key, value) {
            if (typeof key === "string" && LEG_FIELDS.has(key)) leg[key] = value;
            else target[key] = value;
            return true;
        },
        has(target, key) {
            return (typeof key === "string" && LEG_FIELDS.has(key) && key in leg) || key in target;
        },
        ownKeys(target) {
            const keys = new Set(Reflect.ownKeys(target));
            for (const key of Object.keys(leg)) if (LEG_FIELDS.has(key)) keys.add(key);
            for (const key of ["splitLegId", "splitLegIndex", "splitLegCount", "splitTotalPieceCount"]) keys.add(key);
            return [...keys];
        },
        getOwnPropertyDescriptor(target, key) {
            const value = view[key];
            if (value === undefined && !(key in target) && !(key in leg)) return undefined;
            return { value, enumerable: !String(key).startsWith("__"), configurable: true, writable: true };
        }
    });
    return view;
}

function parentOf(item) {
    return item?.__splitParent || item;
}

function legFor(job, { userId = "", role = "", legId = "" } = {}) {
    if (!isSplit(job)) return null;
    if (legId) return job.splitLegs.find(leg => leg.legId === legId) || null;
    if (role === "Driver") return job.splitLegs.find(leg => leg.driverId === userId) || null;
    return job.splitLegs[0];
}

// Turn requested House jobs into the records a pickup action works on: a leg
// view for split Houses (this driver's truck, or payload.legIds[house] /
// payload.legId for staff), the job itself otherwise. Returns null when a
// driver has no truck on a split House.
function targets(jobs, viewer, payload = {}) {
    const out = [];
    for (const job of jobs) {
        if (!isSplit(job)) { out.push(job); continue; }
        const legId = String(payload.legIds?.[job.houseNumber] || payload.legId || "");
        const leg = legFor(job, { userId: viewer?.id, role: viewer?.role, legId });
        if (!leg) return null;
        out.push(legView(job, leg));
    }
    return out;
}

// Every driver-facing work item: plain jobs, plus one leg view per truck of a
// split House (used for round expansion and the driver feed).
function workItems(jobs) {
    return (jobs || []).flatMap(job => isSplit(job) ? job.splitLegs.map(leg => legView(job, leg)) : [job]);
}

const rank = (list, value) => { const i = list.indexOf(String(value || "")); return i < 0 ? 0 : i; };
const earliest = values => values.filter(Boolean).sort()[0];
const latest = values => values.filter(Boolean).sort().slice(-1)[0];

function syncHouse(job) {
    if (!isSplit(job)) return job;
    const legs = job.splitLegs;
    // Before the release document the House is as far as its slowest truck.
    // From the release document on, WH3 drives the House status.
    if (!job.releaseDocumentReceivedAt) {
        const slowest = [...legs].sort((a, b) => rank(STATUS_RANK, a.status) - rank(STATUS_RANK, b.status))[0];
        const slowestRoute = [...legs].sort((a, b) => rank(ROUTE_RANK, a.driverRouteStatus) - rank(ROUTE_RANK, b.driverRouteStatus))[0];
        if (slowest.status) job.status = slowest.status;
        job.driverRouteStatus = slowestRoute.driverRouteStatus || "";
    }
    const all = field => legs.every(leg => leg[field]);
    job.routeStartedAt = earliest(legs.map(leg => leg.routeStartedAt)) || job.routeStartedAt;
    job.checkInAt = earliest(legs.map(leg => leg.checkInAt)) || job.checkInAt;
    job.loadedAt = all("loadedAt") ? latest(legs.map(leg => leg.loadedAt)) : undefined;
    job.completedAt = all("completedAt") ? latest(legs.map(leg => leg.completedAt)) : undefined;
    job.arrivedWh3At = all("arrivedWh3At") ? latest(legs.map(leg => leg.arrivedWh3At)) : undefined;
    if (all("completedAt")) {
        job.pickupReceivedCount = legs.reduce((sum, leg) => sum + Number(leg.pickupReceivedCount || 0), 0);
        const mismatches = legs.filter(leg => leg.pickupCountMismatch).map(leg => ({ legId: leg.legId, vehiclePlate: leg.vehiclePlate, ...leg.pickupCountMismatch }));
        job.pickupCountMismatch = mismatches.length ? { legs: mismatches, planned: Number(job.pieceCount || 0), received: job.pickupReceivedCount, diff: job.pickupReceivedCount - Number(job.pieceCount || 0) } : null;
    }
    for (const key of Object.keys(job)) if (job[key] === undefined) delete job[key];
    job.splitProgress = {
        trucks: legs.length,
        pickedUp: legs.filter(leg => leg.completedAt).length,
        arrivedWh3: legs.filter(leg => leg.arrivedWh3At).length
    };
    return job;
}

function syncTouched(items) {
    const seen = new Set();
    for (const item of items || []) {
        const job = parentOf(item);
        if (job !== item && !seen.has(job)) { seen.add(job); syncHouse(job); }
    }
}

// Plain-object copy of a leg view for API responses / the driver feed.
function plain(item) {
    if (parentOf(item) === item) return item;
    const out = {};
    for (const key of Reflect.ownKeys(item)) if (typeof key === "string" && !key.startsWith("__")) out[key] = item[key];
    // After the release document the House unloads once under the main truck;
    // the other trucks follow the House and are free when it is unloaded.
    const job = parentOf(item), leg = item.__splitLeg;
    if (job.releaseDocumentReceivedAt && leg !== job.splitLegs[0]) {
        out.status = job.status;
        out.driverRouteStatus = job.wh3UnloadCompletedAt ? "Available" : "ArrivedWH3";
        out.releaseDocumentReceivedAt = job.releaseDocumentReceivedAt;
        out.splitFollowsMainTruck = true;
    }
    return out;
}

// Billing: one trip per truck. Returns one record per truck for a split House.
function billingTrips(job) {
    if (!isSplit(job)) return [job];
    return job.splitLegs.map(leg => ({
        ...job, transportRoundId: leg.transportRoundId, pickupBatchId: leg.pickupBatchId, batchId: leg.batchId,
        driverId: leg.driverId, driverName: leg.driverName, vehiclePlate: leg.vehiclePlate, routeStartedAt: leg.routeStartedAt,
        splitLegId: leg.legId
    }));
}

// Build legs when a plan puts one House on several trucks.
// shares: [{driver, plate, pieces, batchId}] in page order (first = main truck).
function buildLegs(job, shares, now) {
    const total = Number(job.pieceCount || 0);
    return shares.map((share, i) => ({
        legId: `L${i + 1}`,
        driverId: share.driver.id,
        driverName: share.driver.name || "",
        vehiclePlate: share.plate,
        batchId: share.batchId,
        pieceCount: share.pieces,
        plannedPieceCount: share.pieces,
        pickupItems: [{ houseNumber: job.houseNumber, carton: String(share.pieces), pickupDestination: "WH3" }],
        status: job.status || "Pending",
        driverRouteStatus: job.driverRouteStatus || "",
        shareOfTotal: total,
        updatedAt: now
    }));
}

module.exports = { LEG_FIELDS, isSplit, legView, parentOf, legFor, targets, workItems, syncHouse, syncTouched, plain, billingTrips, buildLegs };
