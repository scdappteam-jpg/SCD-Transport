/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS API adapter. */
const crypto = require('node:crypto');
const clean = value => String(value ?? '').trim().toUpperCase();
const master = value => /^\d{3}-?\d{8}$/.test(clean(value));
const same = (a, b) => clean(a).replace(/-/g, '') === clean(b).replace(/-/g, '');
const fields = ['onhandNumber', 'hawbNumber', 'mawbNumber'];
const refs = job => Object.fromEntries(['id', 'houseNumber', 'source', ...fields].map(key => [key, job[key] ?? null]));
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function planReferenceFill(db) {
    const jobs = db.jobs || [];
    const linked = jobs.filter(job => job.source === 'PickupReportXlsx' && /^F\d{8,}$/.test(job.houseNumber) && job.hawbNumber && job.hawbNumber !== 'AIR');
    const rows = [];
    for (const source of linked) {
        const targets = jobs.filter(job => job.houseNumber === source.hawbNumber && job.source === 'GlobalConsolCSV');
        if (targets.length !== 1) continue;
        const target = targets[0];
        const reasons = [];
        if (linked.filter(job => job.hawbNumber === target.houseNumber).length !== 1) reasons.push('multiple_onhands');
        if (source.onhandNumber && source.onhandNumber !== source.houseNumber) reasons.push('onhand_identity_conflict');
        if (target.onhandNumber && target.onhandNumber !== source.houseNumber) reasons.push('existing_onhand_conflict');
        if (source.mawbNumber && !master(source.mawbNumber)) reasons.push('invalid_pickup_master');
        if (target.mawbNumber && !master(target.mawbNumber)) reasons.push('invalid_consol_master');
        if (source.mawbNumber && target.mawbNumber && !same(source.mawbNumber, target.mawbNumber)) reasons.push('master_conflict');
        const fingerprint = hash([refs(source), refs(target)]);
        const proof = { pickup: refs(source), consol: refs(target) };
        for (const job of [source, target]) {
            const additions = {};
            if (job === target && !job.onhandNumber) additions.onhandNumber = source.houseNumber;
            const other = job === source ? target : source;
            if (!job.mawbNumber && master(other.mawbNumber)) additions.mawbNumber = clean(other.mawbNumber);
            if (Object.keys(additions).length) rows.push({ houseNumber: job.houseNumber, jobId: job.id, additions, fingerprint, proof, eligible: !reasons.length, reasons });
        }
    }
    return rows;
}

function applyReferenceFill(db, selection, actor) {
    const plan = planReferenceFill(db);
    const selected = (selection || []).map(wanted => {
        const matches = plan.filter(row => row.houseNumber === wanted.houseNumber && row.jobId === wanted.jobId);
        const row = matches[0];
        if (matches.length !== 1 || !row.eligible || row.fingerprint !== wanted.fingerprint) throw new Error('Reference review changed: ' + wanted.houseNumber);
        return row;
    });
    if (!selected.length || new Set(selected.map(row => row.houseNumber)).size !== selected.length) throw new Error('Unique reviewed jobs required');
    // Validate the entire selection before modifying any record. Only the two
    // missing reference fields are written; workflow, packing and CS stay intact.
    db.shipmentReferenceArchive ||= [];
    const applied = [];
    const appliedAt = new Date().toISOString();
    for (const row of selected) {
        const job = db.jobs.find(job => job.houseNumber === row.houseNumber && job.id === row.jobId);
        const before = Object.fromEntries(Object.keys(row.additions).map(key => [key, { present: Object.hasOwn(job, key), value: job[key] ?? null }]));
        Object.assign(job, row.additions);
        job.updatedAt = appliedAt;
        const archive = { id: crypto.randomUUID(), actor, appliedAt, houseNumber: job.houseNumber, jobId: job.id, before, after: { ...row.additions }, proof: row.proof, referenceFingerprint: hash(refs(job)) };
        db.shipmentReferenceArchive.push(archive);
        applied.push({ houseNumber: job.houseNumber, additions: row.additions, archiveId: archive.id });
    }
    return applied;
}

function restoreReferenceFill(db, archiveId) {
    const archive = (db.shipmentReferenceArchive || []).find(row => row.id === archiveId);
    const job = archive && db.jobs.find(job => job.houseNumber === archive.houseNumber && job.id === archive.jobId);
    if (!job || archive.restoredAt || hash(refs(job)) !== archive.referenceFingerprint) throw new Error('References changed after fill');
    for (const [key, old] of Object.entries(archive.before)) {
        if (old.present) job[key] = old.value;
        else delete job[key];
    }
    archive.restoredAt = new Date().toISOString();
    job.updatedAt = archive.restoredAt;
}

module.exports = { planReferenceFill, applyReferenceFill, restoreReferenceFill };
