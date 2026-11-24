// Reads own a fresh, request-local snapshot and never install it into the
// mutable workflow cache, seed state, schedule mirrors, or acknowledge writes.
function createPersonnelReader({shared, request, stateId, readLocal, actorFor, directory, loginUsers, exportZip, sendJson}) {
    const paths = new Set(['/api/people-directory', '/api/people-directory/export', '/api/auth/users']);
    function handles(method, pathname) { return method === 'GET' && paths.has(pathname); }
    async function snapshot() {
        if (!shared()) return readLocal();
        const [rows, sessions] = await Promise.all([
            request('GET', `?id=eq.${encodeURIComponent(stateId)}&select=users:data->users,profiles:data->hr->employeeProfiles,auditLogs:data->hr->auditLogs,updated_at`, null),
            request('GET', `?id=eq.${encodeURIComponent(stateId + ':auth-sessions')}&select=data`, null),
        ]);
        const row = rows?.[0];
        if (!Array.isArray(row?.users) || !Array.isArray(sessions?.[0]?.data?.sessions)) {
            throw new Error('Personnel source or session document is unavailable');
        }
        return {users: row.users, hr: {employeeProfiles: row.profiles || {}, auditLogs: row.auditLogs || []}, authSessions: sessions[0].data.sessions};
    }
    async function handle(req, res, pathname) {
        let db;
        try { db = await snapshot(); }
        catch { return sendJson(res, 503, {error:'โหลดทะเบียนบุคลากรไม่ได้ชั่วคราว กรุณาลองใหม่', code:'PERSONNEL_SOURCE_UNAVAILABLE'}); }
        const actor = actorFor(db, req);
        if (pathname === '/api/auth/users') {
            if (actor?.role === 'People_Viewer') return sendJson(res, 403, {error:'บัญชีนี้ดูได้เฉพาะทะเบียนชื่อและรูปถ่าย'});
            return sendJson(res, 200, {users: loginUsers(db)});
        }
        if (!actor) return sendJson(res, 401, {error:'กรุณาเข้าสู่ระบบใหม่'});
        if (actor.initialCredentialRequired === true || (actor.role === 'People_Viewer' && actor.mustChangePassword === true)) {
            return sendJson(res, 428, {error:'กรุณาตั้ง PIN ใหม่ก่อนใช้งาน', code:'PASSWORD_CHANGE_REQUIRED'});
        }
        if (!['People_Viewer', 'Admin'].includes(actor.role) || (pathname.endsWith('/export') && actor.role !== 'People_Viewer')) {
            return sendJson(res, 403, {error:'ไม่มีสิทธิ์ใช้งานทะเบียนบุคลากรส่วนนี้'});
        }
        const items = directory(db);
        if (pathname.endsWith('/export')) return exportZip(res, items);
        return sendJson(res, 200, {items, count: items.length});
    }
    return {handles, handle};
}
module.exports = {createPersonnelReader};
