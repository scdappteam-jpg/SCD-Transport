// eslint-disable-next-line @typescript-eslint/no-require-imports -- server-only CommonJS compatibility service
const crypto = require('node:crypto');

function contentChunkId(stateId, kind, index, items) {
    const hash = crypto.createHash('sha256').update(JSON.stringify(items)).digest('hex');
    return `${stateId}:${kind}:${index}:${hash}`;
}

// Compare-and-swap protects personnel AND operational data across workers.
// A response lost after commit is recognized by the same commit ID on retry.
async function commitMain({request, id, main, expectedVersion, commitId = crypto.randomUUID()}) {
    if (!expectedVersion) throw Object.assign(new Error('Shared state version is required before saving'), {code:'STATE_WRITE_CONFLICT'});
    const updatedAt = new Date(Math.max(Date.now(), Date.parse(expectedVersion) + 1)).toISOString();
    const rows = await request('PATCH', `?id=eq.${encodeURIComponent(id)}&updated_at=eq.${encodeURIComponent(expectedVersion)}&select=updated_at`, {
        data: {...main, stateCommitId: commitId}, updated_at: updatedAt,
    }, {returnRepresentation: true});
    if (rows?.length === 1) return String(rows[0].updated_at);
    const current = await request('GET', `?id=eq.${encodeURIComponent(id)}&select=updated_at,data->>stateCommitId`, null);
    if (current?.[0]?.stateCommitId === commitId) return String(current[0].updated_at);
    throw Object.assign(new Error('ข้อมูลกลางเปลี่ยนระหว่างบันทึก กรุณาโหลดข้อมูลล่าสุดก่อนทำรายการใหม่'), {code:'STATE_WRITE_CONFLICT'});
}

module.exports = {contentChunkId, commitMain};
