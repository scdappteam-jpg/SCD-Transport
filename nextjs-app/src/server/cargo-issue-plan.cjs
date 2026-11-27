// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createHash } = require("node:crypto");

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
    const seen = new Set(), assignments = [], plateDriver = new Map(), driverPlate = new Map();
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
        for (const expected of page.jobs) {
            const house = String(expected.houseNumber || "");
            if (seen.has(house)) fail("พบ House ซ้ำในแผน");
            seen.add(house);
            const job = (db.jobs || []).find(item => item.houseNumber === house);
            if (!job) fail(`ไม่พบ House ${house}`);
            assignments.push({ job, expected, driver, plate });
        }
    }
    const prior = (db.jobs || []).filter(job => job.cargoIssueRequestId === requestId);
    if (prior.length) {
        if (prior.length !== assignments.length || assignments.some(({ job, driver, plate }) => (job.vehiclePlate || "") !== plate || job.cargoIssueRequestId !== requestId || job.cargoIssueFingerprint !== fingerprint || job.driverId !== driver.id || !job.cargoIssuedAt)) fail("คำขอเดิมเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลใหม่");
        return { jobs: assignments.map(({ job }) => job), pageCount: pages.length, replayed: true, preview, persisted: !preview };
    }
    // Validate every House before changing any of them.
    for (const { job, expected } of assignments) {
        if (!job.csConfirmed) fail(`House ${job.houseNumber} ยังรอ CS ยืนยัน Invoice`);
        if (job.cargoIssuedAt) fail(`House ${job.houseNumber} ออกใบแล้ว กรุณาโหลดข้อมูลใหม่`);
        if (String(job.updatedAt || "") !== String(expected.updatedAt || "")) fail(`House ${job.houseNumber} มีข้อมูลใหม่ กรุณาตรวจ Preview อีกครั้ง`);
    }
    const jobs = assignments.map(({ job, driver, plate }) => {
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
        target.cargoIssueHistory = [...Array.isArray(target.cargoIssueHistory) ? target.cargoIssueHistory : [], { requestId, driverId: driver.id, vehiclePlate: plate, issuedAt: now, issuedBy: actorId, batchId: target.batchId, ...(cargoHeader ? { cargoHeader: { ...cargoHeader } } : {}) }];
        return target;
    });
    return { jobs, pageCount: pages.length, replayed: false, preview, persisted: !preview };
}

module.exports = { apply };
