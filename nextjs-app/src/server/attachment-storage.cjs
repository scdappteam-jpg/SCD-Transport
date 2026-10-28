/* eslint-disable @typescript-eslint/no-require-imports -- server-only storage service */
const crypto = require('node:crypto');
const path = require('node:path');
const { serviceHeaders } = require('./supabase-service-auth.cjs');
function objectPath(file) {
    const date = new Date(file.createdAt);
    if (!file.fileId || Number.isNaN(date.getTime())) throw new Error('Invalid attachment metadata');
    const house = String(file.houseNumber || 'unassigned').replace(/[^A-Za-z0-9_-]/g, '_');
    return `${house}/${date.getUTCFullYear()}/${String(date.getUTCMonth()+1).padStart(2,'0')}/${file.fileId}${path.extname(file.url).toLowerCase() || '.bin'}`;
}
function createStorage({url, key, fetcher = fetch}) {
    const pending = new Map();
    const enabled = Boolean(url && key);
    const headers = serviceHeaders(key);
    const endpoint = file => `${url}/storage/v1/object/scd-documents/${objectPath(file).split('/').map(encodeURIComponent).join('/')}`;
    async function put(file, bytes) {
        const response = await fetcher(endpoint(file), {method:'PUT',headers:{...headers,'Content-Type':file.mimeType,'x-upsert':'true'},body:bytes,signal:AbortSignal.timeout(30000)});
        if (!response.ok) throw Object.assign(new Error(`Unable to save evidence to durable storage (${response.status})`),{statusCode:503});
    }
    return {
        queue(file, bytes) { if (enabled) pending.set(file.fileId,{file,bytes}); },
        async flush() {
            for (const [id, item] of pending) {
                await put(item.file,item.bytes);
                if (pending.get(id) === item) pending.delete(id);
            }
        },
        async restore(db, actor, payload) {
            const fail = (message, statusCode=422) => { throw Object.assign(new Error(message),{statusCode}); };
            if (actor?.role !== 'Admin') fail('Admin required',403);
            if (!enabled) fail('Durable storage is not configured',503);
            const house = String(payload.houseNumber || '');
            if (!house.startsWith('SIT-') || !(db.jobs || []).some(j=>j.houseNumber===house)) fail('Existing SIT job required');
            if (!Array.isArray(payload.files) || !payload.files.length || payload.files.length>4) fail('Supply 1 to 4 registered SIT files');
            const ids = new Set();
            const plan = payload.files.map(input=>{
                const file = (db.attachments || []).find(f=>f.houseNumber===house && f.fileId===input.fileId);
                if (!file || ids.has(input.fileId) || file.mimeType!=='image/png') fail('Unknown, duplicate or unsupported SIT attachment');
                ids.add(input.fileId);
                const bytes = Buffer.from(String(input.base64 || ''),'base64');
                const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
                if (bytes.length>10*1024*1024 || !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || checksum!==input.sha256) fail('SIT file bytes/checksum do not match');
                return {file,bytes,checksum};
            });
            // Validate every remote object before writing. Never replace different
            // evidence; a repeat with identical bytes is safe and creates no IDs.
            for (const item of plan) {
                const response = await fetcher(endpoint(item.file),{headers,signal:AbortSignal.timeout(30000)});
                if (response.ok) {
                    const checksum = crypto.createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
                    if (checksum!==item.checksum) fail('Existing evidence differs; overwrite refused',409);
                    item.present = true;
                } else {
                    const detail = await response.json().catch(()=>({}));
                    if (response.status!==404 && String(detail.statusCode)!=='404') fail('Unable to verify existing storage object',503);
                }
            }
            for (const item of plan) if (!item.present) await put(item.file,item.bytes);
            return {ok:true,houseNumber:house,files:plan.map(item=>({fileId:item.file.fileId,sha256:item.checksum,alreadyPresent:Boolean(item.present)}))};
        },
    };
}
module.exports = {objectPath,createStorage};
