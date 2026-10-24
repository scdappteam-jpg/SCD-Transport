// A short-lived picker delegates an already authenticated Admin's browser.
// It is not a password-free login endpoint for anonymous visitors.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const crypto = require('node:crypto');
const TTL = 2 * 60 * 60 * 1000;
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const active = (s, now) => s && Date.parse(s.expiresAt) > now;
const userFor = (db, id) => (db.users || []).find(u => u.id === id && u.status !== 'Inactive');
function grantValid(db, grant, now) {
    if (!active(grant, now) || grant.kind !== 'TestUserPicker') return false;
    const parent = (db.authSessions || []).find(s => s.id === grant.parentSessionId);
    return active(parent, now) && !parent.kind && userFor(db, parent.userId)?.role === 'Admin';
}
function sessionFor(db, token, now = Date.now()) {
    if (!token) return null;
    const session = (db.authSessions || []).find(s => s.tokenHash === hash(token));
    if (!active(session, now) || session.kind === 'TestUserPicker' || !userFor(db, session.userId)) return null;
    if (session.kind === 'TestUserSession') {
        const grant = (db.authSessions || []).find(s => s.id === session.parentGrantId);
        if (!grantValid(db, grant, now)) return null;
    }
    return session;
}
function handle(db, token, payload, now = Date.now()) {
    const fail = (message, statusCode = 403) => { const e = new Error(message); e.statusCode = statusCode; throw e; };
    const action = payload.action;
    if (!['start', 'switch', 'stop'].includes(action)) fail('คำสั่งโหมดทดสอบไม่ถูกต้อง', 400);
    const sessions = (db.authSessions || []).filter(s => active(s, now));
    let grant;
    if (action === 'start') {
        const parent = sessionFor(db, token, now);
        if (!parent || parent.kind || userFor(db, parent.userId)?.role !== 'Admin') fail('ต้องให้ Admin เข้าสู่ระบบด้วยรหัสผ่านก่อนเปิดโหมดทดสอบ');
        const value = crypto.randomBytes(32).toString('base64url');
        grant = {id: crypto.randomUUID(), kind: 'TestUserPicker', userId: parent.userId, parentSessionId: parent.id,
            tokenHash: hash(value), createdAt: new Date(now).toISOString(), expiresAt: new Date(Math.min(now + TTL, Date.parse(parent.expiresAt))).toISOString()};
        const old = new Set(sessions.filter(s => s.kind === 'TestUserPicker' && s.parentSessionId === parent.id).map(s => s.id));
        db.authSessions = sessions.filter(s => !old.has(s.id) && !old.has(s.parentGrantId));
        db.authSessions.push(grant);
        return {ok: true, token: value, expiresAt: grant.expiresAt, testMode: true};
    }
    grant = sessions.find(s => s.tokenHash === hash(token));
    if (!grantValid(db, grant, now)) fail('โหมดทดสอบหมดอายุ กรุณาให้ Admin เปิดใหม่', 401);
    if (action === 'stop') {
        db.authSessions = sessions.filter(s => s.id !== grant.id && s.parentGrantId !== grant.id);
        return {ok: true, stopped: true};
    }
    const user = userFor(db, payload.userId);
    if (!user) fail('ไม่พบยูสที่เปิดใช้งาน', 404);
    const value = crypto.randomBytes(32).toString('base64url');
    const child = {id: crypto.randomUUID(), kind: 'TestUserSession', userId: user.id, parentGrantId: grant.id,
        issuedByAdmin: grant.userId, tokenHash: hash(value), createdAt: new Date(now).toISOString(), expiresAt: grant.expiresAt};
    // Bound test sessions without evicting the password-authenticated parent.
    const oldChildren = sessions.filter(s => s.kind === 'TestUserSession' && s.parentGrantId === grant.id).slice(-99);
    db.authSessions = [...sessions.filter(s => s.kind !== 'TestUserSession' || s.parentGrantId !== grant.id), ...oldChildren, child];
    return {ok: true, token: value, expiresAt: child.expiresAt, testMode: true, user: {id: user.id, name: user.name, role: user.role}};
}
module.exports = {handle, sessionFor};
