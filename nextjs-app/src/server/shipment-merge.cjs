/* eslint-disable @typescript-eslint/no-require-imports -- Loaded by the CommonJS API adapter. */
const crypto = require('node:crypto');

const snapshot = value => JSON.parse(JSON.stringify(value));
const fingerprint = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const positive = value => Number.isFinite(Number(value)) && Number(value) > 0;
const workCollections = ['billing', 'loadPlans', 'taskGroups', 'attachments', 'activityLogs', 'pickupRequests', 'warehouseReceipts', 'terminalBookings'];

function hasReferences(db, job) {
    // Unknown operational collections also block a merge. Import/audit history
    // is retained as source history and is not a live workflow reference.
    const ignored = new Set(['jobs', 'importChanges', 'importHistory', 'alerts', 'notifications', 'shipmentMergeArchive', 'shipmentReferenceArchive']);
    const collections = new Set([...workCollections, ...Object.keys(db).filter(key => !ignored.has(key) && Array.isArray(db[key]))]);
    return [...collections].some(key => {
        const text = JSON.stringify(db[key] || []);
        return text.includes(JSON.stringify(job.houseNumber)) || (job.id && text.includes(JSON.stringify(job.id)));
    });
}

function planShipmentMerges(db, evidence) {
    const byHouse = new Map(db.jobs.map(job => [job.houseNumber, job]));
    const fJobs = db.jobs.filter(job => /^F84\d+$/.test(job.houseNumber) && /^484\d+$/.test(job.hawbNumber || '') && byHouse.has(job.hawbNumber));
    const counts = new Map();
    for (const job of fJobs) counts.set(job.hawbNumber, (counts.get(job.hawbNumber) || 0) + 1);
    const checked = new Map((evidence || []).map(row => [row.onhand, row]));
    return fJobs.map(source => {
        const target = byHouse.get(source.hawbNumber);
        const proof = checked.get(source.houseNumber);
        const reasons = [];
        if (source.source !== 'PickupReportXlsx' || target.source !== 'GlobalConsolCSV') reasons.push('unexpected_source');
        if (counts.get(target.houseNumber) !== 1) reasons.push('multiple_onhands');
        if (!proof || proof.hawb !== target.houseNumber || !['equal', 'different_units'].includes(proof.quantityCheck)) reasons.push('quantity_unresolved');
        if (proof && (Number(source.pieceCount) !== proof.pickupPieces || Number(target.pieceCount) !== proof.consolPieces)) reasons.push('source_changed');
        const packages = proof?.source?.units || {};
        const unit = positive(packages.PLT) ? 'PLT' : positive(packages.CTN) ? 'CTN' : '';
        if (!unit || !Object.values(packages).some(qty => Number(qty) === Number(source.pieceCount))) reasons.push('quantity_evidence_missing');
        if (source.status !== 'Pending' || target.status !== 'Pending') reasons.push('workflow_started');
        if (Boolean(source.csConfirmed) !== Boolean(target.csConfirmed)) reasons.push('approval_conflict');
        const preserveBulk = proof?.bulkPolicy === 'preserve_both_use_hawb'
            && source.csConfirmed === true && target.csConfirmed === true
            && /^BULK-\d{4}-\d{2}-\d{2}$/.test(source.csInvoiceNo || '')
            && /^BULK-\d{4}-\d{2}-\d{2}$/.test(target.csInvoiceNo || '')
            && !source.invoiceNo && !target.invoiceNo;
        if (source.csConfirmed && (source.csInvoiceNo || '') !== (target.csInvoiceNo || '') && !preserveBulk) reasons.push('invoice_conflict');
        if ((source.invoiceNo || '') !== (target.invoiceNo || '')) reasons.push('actual_invoice_conflict');
        if ([source, target].some(job => job.cargoIssuedAt || job.driverId || job.vehiclePlate || job.readyForBilling)) reasons.push('workflow_assigned');
        if (hasReferences(db, source)) reasons.push('source_has_references');
        return {
            onhand: source.houseNumber, hawb: target.houseNumber,
            eligible: reasons.length === 0, reasons,
            pickupPieces: Number(source.pieceCount), oldConsolPieces: Number(target.pieceCount),
            packageCounts: packages, pieces: Number(packages[unit]), unit,
            fingerprint: fingerprint([source, target]),
            sourceRow: proof?.source?.sheetRow || null,
            preserveBulk
        };
    });
}

function applyShipmentMerges(db, evidence, selection, actor) {
    const plan = planShipmentMerges(db, evidence);
    const byF = new Map(plan.map(row => [row.onhand, row]));
    // Validate the entire batch before touching any record.
    const selected = (selection || []).map(wanted => {
        const row = byF.get(wanted.onhand);
        if (!row?.eligible || row.fingerprint !== wanted.fingerprint) throw new Error(`Merge review changed: ${wanted.onhand}`);
        return row;
    });
    if (new Set(selected.map(row => row.onhand)).size !== selected.length) throw new Error('Duplicate merge selection');
    db.shipmentMergeArchive ||= [];
    const merged = [];
    for (const row of selected) {
        const source = db.jobs.find(job => job.houseNumber === row.onhand);
        const target = db.jobs.find(job => job.houseNumber === row.hawb);
        const archive = {
            id: crypto.randomUUID(), mergedAt: new Date().toISOString(), actor,
            source: snapshot(source), targetBefore: snapshot(target), review: snapshot(row)
        };
        target.onhandNumber = row.onhand;
        target.hawbNumber = row.hawb;
        target.mergedHouseNumbers = [...new Set([...(target.mergedHouseNumbers || []), row.onhand])];
        target.pickupSourcePieces = row.pickupPieces;
        target.consolSourcePieces = row.oldConsolPieces;
        target.packageCounts = snapshot(row.packageCounts);
        target.pieceCount = String(row.pieces);
        target.packageType = row.unit;
        if (row.preserveBulk) {
            const history = [...(target.csConfirmationHistory || [])];
            for (const job of [target, source]) {
                const record = { sourceHouseNumber: job.houseNumber };
                for (const key of ['csConfirmed', 'csInvoiceNo', 'csConfirmedBy', 'csConfirmedAt', 'csContactName', 'evidenceChannel', 'evidenceNote']) record[key] = job[key] ?? null;
                if (!history.some(old => old.sourceHouseNumber === record.sourceHouseNumber && old.csInvoiceNo === record.csInvoiceNo && old.csConfirmedAt === record.csConfirmedAt)) history.push(record);
            }
            target.csConfirmationHistory = history;
        }
        for (const key of ['pickupLocation', 'pickupPhone', 'tel', 'contact', 'contactPerson', 'carrier', 'ownerCode', 'refsNo', 'readyTime', 'closeTime', 'cargoCutoffAt', 'pickupDate']) {
            if (!target[key] && source[key]) target[key] = source[key];
        }
        target.updatedAt = archive.mergedAt;
        archive.targetAfterFingerprint = fingerprint(target);
        db.shipmentMergeArchive.push(archive);
        db.jobs = db.jobs.filter(job => job !== source);
        merged.push({ onhand: row.onhand, hawb: row.hawb, archiveId: archive.id });
    }
    return merged;
}

function restoreShipmentMerge(db, archiveId) {
    const archive = (db.shipmentMergeArchive || []).find(row => row.id === archiveId && !row.restoredAt);
    if (!archive) throw new Error('Merge archive not found');
    const target = db.jobs.find(job => job.houseNumber === archive.targetBefore.houseNumber);
    if (!target || fingerprint(target) !== archive.targetAfterFingerprint || db.jobs.some(job => job.houseNumber === archive.source.houseNumber)) throw new Error('Job changed after merge; manual recovery required');
    db.jobs[db.jobs.indexOf(target)] = snapshot(archive.targetBefore);
    db.jobs.push(snapshot(archive.source));
    archive.restoredAt = new Date().toISOString();
}

function updateMergedPickup(job, payload) {
    job.onhandNumber = payload.onhandNumber;
    job.pickupSourcePieces = payload.pieceCount;
    // Consolidated packing and CS/workflow data belong to the HAWB job.
    for (const key of ['pickupLocation', 'pickupPhone', 'tel', 'contact', 'contactPerson', 'carrier', 'ownerCode', 'refsNo', 'readyTime', 'closeTime', 'cargoCutoffAt', 'pickupDate']) {
        if (payload[key]) job[key] = payload[key];
    }
    job.updatedAt = new Date().toISOString();
    return job;
}

module.exports = { planShipmentMerges, applyShipmentMerges, restoreShipmentMerge, updateMergedPickup };
