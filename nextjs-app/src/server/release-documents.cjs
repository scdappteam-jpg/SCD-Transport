/* eslint-disable @typescript-eslint/no-require-imports -- server-only domain service */
function fail(message, statusCode = 422) {
    throw Object.assign(new Error(message), { statusCode });
}

function validate(jobs, payload, evidence) {
    const expected = new Map(jobs.map(job => [ String(job.houseNumber || "").trim(), job ]));
    let rows = Array.isArray(payload.releaseDocuments) ? payload.releaseDocuments : [];

    // Keep old clients working for a single House only. A shared upload must
    // never be copied across a multi-House vehicle round.
    if (!rows.length && expected.size === 1 && Array.isArray(payload.releaseDocumentFiles)) {
        rows = [ {
            houseNumber: jobs[0].houseNumber,
            documentNumber: payload.releaseDocumentNumber || "",
            files: payload.releaseDocumentFiles
        } ];
    }
    if (!rows.length) fail("ต้องแนบใบตรวจปล่อยแยกราย House ให้ครบก่อนยืนยัน");

    const normalized = [];
    const seen = new Set;
    for (const row of rows) {
        const houseNumber = String(row?.houseNumber || "").trim();
        if (!expected.has(houseNumber)) fail(`House ${houseNumber || "(ว่าง)"} ไม่ได้อยู่ในรอบรถนี้`, 409);
        if (seen.has(houseNumber)) fail(`พบใบตรวจปล่อยของ House ${houseNumber} ซ้ำ`);
        const files = Array.isArray(row?.files) ? row.files : [];
        if (!files.length) fail(`กรุณาแนบหลักฐานใบตรวจปล่อยของ House ${houseNumber}`);
        files.forEach(file => evidence(file, `ใบตรวจปล่อย House ${houseNumber}`));
        seen.add(houseNumber);
        normalized.push({
            houseNumber,
            documentNumber: String(row?.documentNumber || "").trim(),
            files
        });
    }
    const missing = [ ...expected.keys() ].filter(houseNumber => !seen.has(houseNumber));
    if (missing.length) fail(`ใบตรวจปล่อยยังไม่ครบ ${missing.length} House: ${missing.join(", ")}`, 409);
    if (normalized.length !== expected.size) fail("จำนวนใบตรวจปล่อยไม่ตรงกับจำนวน House บนรถ", 409);
    return normalized;
}

module.exports = { validate };
