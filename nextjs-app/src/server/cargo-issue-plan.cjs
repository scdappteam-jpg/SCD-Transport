// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createHash } = require("node:crypto");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const splitLegs = require("./split-legs.cjs");

function apply(db, payload, actorId, { preview = false, now = new Date().toISOString() } = {}) {
    const fail = message => { throw new Error(message); };
    const requestId = String(payload.requestId || "");
    if (!/^[a-zA-Z0-9-]{8,100}$/.test(requestId)) fail("คำขอออกใบไม่ถูกต้อง");
    const pages = payload.pages;
    if (!Array.isArray(pages) || !pages.length || pages.length > 300) fail("กรุณาตรวจจำนวนหน้า Preview");
    const cargoHeader = payload.cargoHeader === undefined ? undefined : {};
    if (cargoHeader) {
        if (!payload.cargoHeader || typeof payload.cargoHeader !== "object" || Array.isArray(payload.cargoHeader)) fail("ข้อมูลหัวใบ Cargo ไม่ถูกต้อง");
        for (const key of ["contact", "tel", "pickupDate", "pickupTime"]) {
            if (!Object.hasOwn(payload.cargoHeader, key)) continue;
            const value = payload.cargoHeader[key];
            if (typeof value !== "string" || value.length > 200) fail("ข้อมูลหัวใบ Cargo ไม่ถูกต้อง");
            cargoHeader[key] = value.trim();
        }
        if (cargoHeader.pickupDate !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(cargoHeader.pickupDate) || !Number.isFinite(Date.parse(cargoHeader.pickupDate)) || new Date(cargoHeader.pickupDate).toISOString().slice(0, 10) !== cargoHeader.pickupDate)) fail("วันที่รับสินค้าไม่ถูกต้อง");
        if (cargoHeader.pickupTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(cargoHeader.pickupTime)) fail("เวลารับสินค้าไม่ถูกต้อง");
    }
    const fingerprint = createHash("sha256").update(JSON.stringify({ actorId, pages, cargoHeader })).digest("hex");
    const seen = new Map(), assignments = [], plateDriver = new Map(), driverPlate = new Map();
    const activeFleetPlates = new Set((db.fleetVehicles || []).filter(v => v && v.status !== "Inactive" && v.plate).map(v => String(v.plate)));
    for (const page of pages) {
        const driver = (db.users || []).find(user => user.id === page.driverId && ["Driver", "WH_Staff", "Admin"].includes(user.role) && user.status !== "Inactive");
        if (!driver) fail("ไม่พบคนขับในแผน กรุณาเลือกใหม่");
        if (page.driverName !== (driver.name || "")) fail("ข้อมูลคนขับหรือทะเบียนเปลี่ยน กรุณาตรวจ Preview ใหม่");
        // The plate is the driver's own vehicle, or any active company fleet vehicle chosen for this lane.
        const plate = typeof page.vehiclePlate === "string" ? page.vehiclePlate : "";
        if (plate !== (driver.vehiclePlate || "") && !activeFleetPlates.has(plate)) fail("ข้อมูลคนขับหรือทะเบียนเปลี่ยน กรุณาตรวจ Preview ใหม่");
        if (plate && plateDriver.has(plate) && plateDriver.get(plate) !== driver.id) fail(`ทะเบียน ${plate} ถูกเลือกให้คนขับมากกว่า 1 คน`);
        if (driverPlate.has(driver.id) && driverPlate.get(driver.id) !== plate) fail(`คนขับ ${driver.name || driver.id} ถูกเลือกรถมากกว่า 1 คันในแผนเดียว`);
        if (plate) plateDriver.set(plate, driver.id);
        driverPlate.set(driver.id, plate);
        if (!Array.isArray(page.jobs) || !page.jobs.length || page.jobs.length > 5) fail("ใบ Cargo ขาเข้าต้องมี 1 ถึง 5 House");
        const onPage = new Set();
        for (const expected of page.jobs) {
            const house = String(expected.houseNumber || "");
            if (onPage.has(house)) fail("พบ House ซ้ำในแผน");
            onPage.add(house);
            const job = (db.jobs || []).find(item => item.houseNumber === house);
            if (!job) fail(`ไม่พบ House ${house}`);
            const pieces = expected.splitPieces === undefined ? null : Number(expected.splitPieces);
            if (pieces !== null && (!Number.isSafeInteger(pieces) || pieces <= 0)) fail(`จำนวนกล่องที่แบ่งของ House ${house} ต้องเป็นจำนวนเต็มมากกว่า 0`);
            assignments.push({ job, expected, driver, plate, pieces, batchId: `BATCH-${requestId}-${driver.id}` });
            if (!seen.has(house)) seen.set(house, []);
            seen.get(house).push(assignments[assignments.length - 1]);
        }
    }
    // One House on several trucks: every share names its cartons, the shares add
    // up to the House plan, and each truck has a different driver.
    for (const [house, shares] of seen) {
        if (shares.length === 1) {
            if (shares[0].pieces !== null) fail(`House ${house} ระบุจำนวนแบ่งแต่มีรถคันเดียว`);
            continue;
        }
        if (shares.some(share => share.pieces === null)) fail("พบ House ซ้ำในแผน");
        if (shares.length > 10) fail(`House ${house} แบ่งได้ไม่เกิน 10 คัน`);
        if (new Set(shares.map(share => share.driver.id)).size !== shares.length) fail(`House ${house} แบ่งให้คนขับคนเดียวกันซ้ำ`);
        const total = Number(shares[0].job.pieceCount);
        const sum = shares.reduce((acc, share) => acc + share.pieces, 0);
        if (!Number.isFinite(total) || total <= 0) fail(`House ${house} ไม่มีจำนวนกล่องตามแผน จึงแบ่งหลายคันไม่ได้`);
        if (sum !== total) fail(`House ${house} แบ่งรวม ${sum} กล่อง ไม่เท่าแผน ${total} กล่อง`);
    }
    const prior = (db.jobs || []).filter(job => job.cargoIssueRequestId === requestId);
    if (prior.length) {
        const sameTruck = ({ job, driver, plate }) => splitLegs.isSplit(job)
            ? job.splitLegs.some(leg => leg.driverId === driver.id && (leg.vehiclePlate || "") === plate)
            : (job.vehiclePlate || "") === plate && job.driverId === driver.id;
        if (prior.length !== seen.size || assignments.some(item => !sameTruck(item) || item.job.cargoIssueRequestId !== requestId || item.job.cargoIssueFingerprint !== fingerprint || !item.job.cargoIssuedAt)) fail("คำขอเดิมเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลใหม่");
        return { jobs: [...seen.values()].map(shares => shares[0].job), pageCount: pages.length, replayed: true, preview, persisted: !preview };
    }
    // Validate every House before changing any of them.
    for (const { job, expected } of assignments) {
        if (!job.csConfirmed) fail(`House ${job.houseNumber} ยังรอ CS ยืนยัน Invoice`);
        if (job.cargoIssuedAt) fail(`House ${job.houseNumber} ออกใบแล้ว กรุณาโหลดข้อมูลใหม่`);
        if (String(job.updatedAt || "") !== String(expected.updatedAt || "")) fail(`House ${job.houseNumber} มีข้อมูลใหม่ กรุณาตรวจ Preview อีกครั้ง`);
    }
    const jobs = [...seen.values()].map(shares => {
        const { job, driver, plate } = shares[0];
        const target = preview ? structuredClone(job) : job;
        Object.assign(target, {
            driverId: driver.id, driverName: driver.name || "", vehiclePlate: plate,
            batchId: `BATCH-${requestId}-${driver.id}`, cargoIssuedAt: now, updatedAt: now,
            cargoIssueRequestId: requestId, cargoIssueFingerprint: fingerprint
        });
        if (cargoHeader) {
            target.cargoPickupHeader = { ...cargoHeader };
            for (const [key, field] of Object.entries({contact:"contactPerson",tel:"pickupPhone",pickupDate:"pickupDate",pickupTime:"pickupTime"})) {
                if (Object.hasOwn(cargoHeader, key)) target[field] = cargoHeader[key];
            }
        }
        if (shares.length > 1) {
            target.splitLegs = splitLegs.buildLegs(target, shares.map(share => ({ driver: share.driver, plate: share.plate, pieces: share.pieces, batchId: share.batchId })), now);
            splitLegs.syncHouse(target);
        }
        target.cargoIssueHistory = [...Array.isArray(target.cargoIssueHistory) ? target.cargoIssueHistory : [], { requestId, driverId: driver.id, vehiclePlate: plate, issuedAt: now, issuedBy: actorId, batchId: target.batchId, ...(cargoHeader ? { cargoHeader: { ...cargoHeader } } : {}), ...(shares.length > 1 ? { splitLegs: target.splitLegs.map(leg => ({ legId: leg.legId, driverId: leg.driverId, vehiclePlate: leg.vehiclePlate, pieceCount: leg.pieceCount, batchId: leg.batchId })) } : {}) }];
        return target;
    });
    return { jobs, pageCount: pages.length, replayed: false, preview, persisted: !preview };
}

module.exports = { apply };
