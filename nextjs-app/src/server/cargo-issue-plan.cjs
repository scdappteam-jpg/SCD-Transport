// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createHash } = require("node:crypto");

function apply(db, payload, actorId, { preview = false, now = new Date().toISOString() } = {}) {
    const fail = message => { throw new Error(message); };
    const requestId = String(payload.requestId || "");
    if (!/^[a-zA-Z0-9-]{8,100}$/.test(requestId)) fail("คำขอออกใบไม่ถูกต้อง");
    const pages = payload.pages;
    if (!Array.isArray(pages) || !pages.length || pages.length > 300) fail("กรุณาตรวจจำนวนหน้า Preview");
    const fingerprint = createHash("sha256").update(JSON.stringify({ actorId, pages })).digest("hex");
    const seen = new Set(), assignments = [];
    for (const page of pages) {
        const driver = (db.users || []).find(user => user.id === page.driverId && ["Driver", "WH_Staff", "Admin"].includes(user.role) && user.status !== "Inactive");
        if (!driver) fail("ไม่พบคนขับในแผน กรุณาเลือกใหม่");
        if (page.vehiclePlate !== (driver.vehiclePlate || "") || page.driverName !== (driver.name || "")) fail("ข้อมูลคนขับหรือทะเบียนเปลี่ยน กรุณาตรวจ Preview ใหม่");
        if (!Array.isArray(page.jobs) || !page.jobs.length || page.jobs.length > 5) fail("ใบ Cargo ขาเข้าต้องมี 1 ถึง 5 House");
        for (const expected of page.jobs) {
            const house = String(expected.houseNumber || "");
            if (seen.has(house)) fail("พบ House ซ้ำในแผน");
            seen.add(house);
            const job = (db.jobs || []).find(item => item.houseNumber === house);
            if (!job) fail(`ไม่พบ House ${house}`);
            assignments.push({ job, expected, driver });
        }
    }
    const prior = (db.jobs || []).filter(job => job.cargoIssueRequestId === requestId);
    if (prior.length) {
        if (prior.length !== assignments.length || assignments.some(({ job, driver }) => job.cargoIssueRequestId !== requestId || job.cargoIssueFingerprint !== fingerprint || job.driverId !== driver.id || !job.cargoIssuedAt)) fail("คำขอเดิมเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลใหม่");
        return { jobs: assignments.map(({ job }) => job), pageCount: pages.length, replayed: true, preview, persisted: !preview };
    }
    // Validate every House before changing any of them.
    for (const { job, expected } of assignments) {
        if (!job.csConfirmed) fail(`House ${job.houseNumber} ยังรอ CS ยืนยัน Invoice`);
        if (job.cargoIssuedAt) fail(`House ${job.houseNumber} ออกใบแล้ว กรุณาโหลดข้อมูลใหม่`);
        if (String(job.updatedAt || "") !== String(expected.updatedAt || "")) fail(`House ${job.houseNumber} มีข้อมูลใหม่ กรุณาตรวจ Preview อีกครั้ง`);
    }
    const jobs = assignments.map(({ job, driver }) => {
        const target = preview ? structuredClone(job) : job;
        Object.assign(target, {
            driverId: driver.id, driverName: driver.name || "", vehiclePlate: driver.vehiclePlate || "",
            batchId: `BATCH-${requestId}-${driver.id}`, cargoIssuedAt: now, updatedAt: now,
            cargoIssueRequestId: requestId, cargoIssueFingerprint: fingerprint
        });
        target.cargoIssueHistory = [...Array.isArray(target.cargoIssueHistory) ? target.cargoIssueHistory : [], { requestId, driverId: driver.id, vehiclePlate: driver.vehiclePlate || "", issuedAt: now, issuedBy: actorId, batchId: target.batchId }];
        return target;
    });
    return { jobs, pageCount: pages.length, replayed: false, preview, persisted: !preview };
}

module.exports = { apply };
