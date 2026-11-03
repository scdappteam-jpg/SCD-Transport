import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
const policy = require('../src/server/hr-security.cjs');
const source = readFileSync(new URL('../src/server/legacy-api.cjs', import.meta.url), 'utf8');
const boundary = source.slice(source.indexOf("    if (pathname.startsWith('/api/hr/')"), source.indexOf('    // All legacy and modern entry points'));
const routes = source.slice(source.indexOf('    if (req.method === "GET" && pathname === "/api/hr/bootstrap")'), source.indexOf('    if (req.method === "GET" && pathname === "/api/taskgroups/today")'));
const helpers = source.slice(source.indexOf('function hrRequireSelfServiceActor('), source.indexOf('function requireBillingActor('));

function fixture() {
    return JSON.parse(JSON.stringify({
        users: [
            { id: 'employee', role: 'Driver', name: 'Employee' },
            { id: 'other', role: 'Driver', name: 'Other' },
            { id: 'lead', role: 'WH3_TeamLeader', name: 'Lead' },
            { id: 'stranger', role: 'WH3_TeamLeader', name: 'Other Lead' },
            { id: 'admin', role: 'Admin', name: 'Admin' }
        ],
        hr: {
            employeeProfiles: { employee: { supervisorId: 'lead', assignedLocationIds: ['office'] }, other: { supervisorId: 'stranger' } },
            settings: { attendance: { enforceAssignedLocations: true, defaultRadiusMeters: 300 }, otRates: { normal: 1.5 }, quotas: { personal: 6 } },
            checkInLocations: [{ id: 'office', name: 'Office', latitude: 13.7, longitude: 100.5, radiusMeters: 300 }],
            leaveRequests: [], otRequests: [], attendanceCorrections: [],
            payrollProfiles: { employee: { baseSalary: 20000 } }, payrollRuns: []
        },
        notifications: [
            { id: 'mine', module: 'HR', targetUserIds: ['employee'] },
            { id: 'private', module: 'HR', targetUserIds: ['other'] }
        ],
        attendance: [], jobs: []
    }));
}

async function request(db: ReturnType<typeof fixture>, actorId: string, path: string, payload: Record<string, unknown> = {}, method = 'POST') {
    let writes = 0;
    const context = vm.createContext({
        req: { method, url: path }, res: {}, pathname: path.split('?')[0],
        db, readDb: () => db, parseBody: async () => payload,
        sessionUser: () => db.users.find((user: { id: string }) => user.id === actorId),
        hrSecurity: policy, hrWorkflows: require('../src/server/hr-workflows.cjs'), URL, Date, crypto, TZ: 'Asia/Bangkok',
        nowIso: () => '2026-11-01T03:00:00.000Z',
        writeDb: () => { writes++; },
        sendJson: (_res: unknown, status: number, body: unknown) => ({ status, body }),
        notifyHrApprover: () => {}, notifyHrExecutive: () => {}, notifyHrEmployee: () => {},
        applyApprovedAttendanceCorrection: (db: ReturnType<typeof fixture>, request: Record<string, unknown>) => require('../src/server/hr-workflows.cjs').applyCorrection(db, request, '2026-11-01T03:00:00Z'),
        findJob: (_db: unknown, house: string) => db.jobs.find((job: { houseNumber: string }) => job.houseNumber === house)
    });
    vm.runInContext(`${helpers}\nasync function run() {${boundary}\n${routes}}`, context);
    const response = await vm.runInContext('run()', context);
    // Convert cross-context values so deep comparisons use normal prototypes.
    return { ...JSON.parse(JSON.stringify(response)), writes };
}

test('HR and attendance require a session even if global auth is disabled', async () => {
    for (const [path, method] of [['/api/hr/bootstrap', 'GET'], ['/api/hr/profile', 'POST'], ['/api/attendance/checkin', 'POST'], ['/api/attendance/all', 'GET']]) {
        const db = fixture(), before = structuredClone(db);
        const result = await request(db, '', path, {}, method);
        assert.equal(result.status, 401);
        assert.equal(result.writes, 0);
        assert.deepEqual(db, before);
    }
});

test('forged viewer IDs and omitted IDs cannot expose another employee or payroll', async () => {
    const db = fixture();
    db.hr.leaveRequests = [{ id: 'mine', employeeId: 'employee' }, { id: 'secret', employeeId: 'other' }];
    for (const query of ['', '?viewerId=admin', '?viewerId=other']) {
        const result = await request(db, 'employee', '/api/hr/bootstrap' + query, {}, 'GET');
        assert.equal(result.status, 200);
        assert.deepEqual(result.body.leaveRequests.map((row: { id: string }) => row.id), ['mine']);
        assert.deepEqual(Object.keys(result.body.employeeProfiles), ['employee']);
        assert.deepEqual(result.body.payrollProfiles, {});
        assert.deepEqual(result.body.notifications.map((row: { id: string }) => row.id), ['mine']);
    }
});

test('forged requester IDs cannot submit for someone else; mutation responses stay scoped', async () => {
    const db = fixture();
    db.hr.leaveRequests.push({ id: 'secret', employeeId: 'other' });
    const payload = { employeeId: 'other', requesterId: 'admin', startDate: '2026-11-02', endDate: '2026-11-02', type: 'personal', reason: 'Personal errand' };
    assert.equal((await request(db, 'employee', '/api/hr/leave', payload)).status, 403);
    const result = await request(db, 'employee', '/api/hr/leave', { ...payload, employeeId: 'employee' });
    assert.equal(result.status, 201);
    assert.equal(result.body.leaveRequests.length, 1);
    assert.equal(result.body.leaveRequests[0].employeeId, 'employee');
});

test('profile editing and month close require administrators', async () => {
    const db = fixture(), before = structuredClone(db);
    for (const path of ['/api/hr/profile', '/api/hr/close-month', '/api/hr/payroll-profile', '/api/hr/attendance-settings']) {
        assert.equal((await request(db, 'employee', path, { employeeId: 'other', actorId: 'admin' })).status, 403);
    }
    assert.deepEqual(db, before);
    assert.equal((await request(db, 'admin', '/api/hr/profile', { employeeId: 'employee', nickname: 'Updated' })).status, 200);
    assert.equal(db.hr.employeeProfiles.employee.nickname, 'Updated');
});

test('only assigned lead can approve first step; management approves final step', async () => {
    const db = fixture();
    db.hr.leaveRequests.push({ id: 'leave', employeeId: 'employee', status: 'pendingLead', trail: [], startDate: '2026-11-02', endDate: '2026-11-02', type: 'personal', reason: 'Errand', part: 'full' });
    const payload = { kind: 'leave', id: 'leave', action: 'approve', actorId: 'admin' };
    for (const actor of ['employee', 'stranger']) assert.equal((await request(db, actor, '/api/hr/request-action', payload)).status, 403);
    assert.equal(db.hr.leaveRequests[0].status, 'pendingLead');
    assert.equal((await request(db, 'lead', '/api/hr/request-action', payload)).status, 200);
    assert.equal(db.hr.leaveRequests[0].status, 'pendingExecutive');
    assert.equal((await request(db, 'lead', '/api/hr/request-action', payload)).status, 403);
    assert.equal((await request(db, 'admin', '/api/hr/request-action', payload)).status, 200);
    assert.equal(db.hr.leaveRequests[0].status, 'approved');
});

test('self approval, cross-team OT recording and close are blocked', async () => {
    const db = fixture();
    db.hr.otRequests.push({ id: 'ot', employeeId: 'employee', status: 'approved', requestedHours: 2 });
    for (const action of ['recordActual', 'close']) {
        assert.equal((await request(db, 'stranger', '/api/hr/request-action', { kind: 'ot', id: 'ot', action, actualHours: 2 })).status, 403);
    }
    assert.equal((await request(db, 'lead', '/api/hr/request-action', { kind: 'ot', id: 'ot', action: 'recordActual', actualHours: 2 })).status, 200);
    assert.equal((await request(db, 'lead', '/api/hr/request-action', { kind: 'ot', id: 'ot', action: 'close' })).status, 200);
    db.hr.leaveRequests.push({ id: 'own', employeeId: 'admin', status: 'pendingExecutive' });
    assert.equal((await request(db, 'admin', '/api/hr/request-action', { id: 'own', action: 'approve' })).status, 403);
});

test('attendance cannot be recorded for another account, including by administrators', async () => {
    for (const path of ['/api/attendance/checkin', '/api/attendance/checkout']) {
        for (const actor of ['other', 'admin']) {
            const db = fixture();
            assert.equal((await request(db, actor, path, { userId: 'employee', gpsLat: 13.7, gpsLon: 100.5 })).status, 403);
            assert.equal(db.attendance.length, 0);
        }
    }
});

test('checkin and checkout validate GPS, radius and simulation before any mutation', async () => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    const invalid = [
        { gpsLat: null, gpsLon: 100.5 }, { gpsLat: '', gpsLon: 100.5 },
        { gpsLat: false, gpsLon: 100.5 }, { gpsLat: [], gpsLon: 100.5 },
        { gpsLat: 91, gpsLon: 100.5 }, { gpsLat: 13.7, gpsLon: 181 },
        { gpsLat: 'NaN', gpsLon: 100.5 }, { gpsLat: 0, gpsLon: 0 },
        { gpsLat: 0, gpsLon: 0, simulation: true },
        { gpsLat: 0, gpsLon: 0, simulation: 'true' }
    ];
    for (const path of ['/api/attendance/checkin', '/api/attendance/checkout']) {
        for (const gps of invalid) {
            const db = fixture();
            if (path.endsWith('checkout')) db.attendance.push({ id: 'att', userId: 'employee', date: today, checkInTime: 'server-time' });
            const before = structuredClone(db);
            const result = await request(db, 'employee', path, { userId: 'employee', ...gps });
            assert.ok([400, 403].includes(result.status), JSON.stringify({ path, gps, result }));
            assert.equal(result.writes, 0);
            assert.deepEqual(db, before);
        }
    }
});

test('inside-radius checkin and checkout store server time and location evidence', async () => {
    const db = fixture(), payload = { userId: 'employee', gpsLat: 13.7, gpsLon: 100.5, checkInTime: 'forged-time' };
    const checkin = await request(db, 'employee', '/api/attendance/checkin', payload);
    assert.equal(checkin.status, 200);
    assert.equal(checkin.body.record.checkInTime, '2026-11-01T03:00:00.000Z');
    assert.equal(checkin.body.record.checkInLocationId, 'office');
    assert.equal((await request(db, 'employee', '/api/attendance/checkin', payload)).status, 409);
    const checkout = await request(db, 'employee', '/api/attendance/checkout', payload);
    assert.equal(checkout.status, 200);
    assert.equal(checkout.body.record.checkOutLocationId, 'office');
    assert.equal(checkout.body.record.checkOutDistanceMeters, 0);
    assert.equal(checkout.body.record.checkOutTime, '2026-11-01T03:00:00.000Z');
    assert.equal((await request(db, 'employee', '/api/attendance/checkout', payload)).status, 404);
});

test('location assignments, disabled locations, overlapping radii and zero coordinates', () => {
    const db = fixture();
    db.hr.checkInLocations.push({ id: 'unassigned', latitude: 0, longitude: 0, radiusMeters: 300 });
    assert.throws(() => policy.attendanceLocation(db, 'employee', 0, 0));
    db.hr.checkInLocations[0].active = false;
    assert.throws(() => policy.attendanceLocation(db, 'employee', 13.7, 100.5));
    db.hr.settings.attendance.enforceAssignedLocations = false;
    assert.equal(policy.attendanceLocation(db, 'employee', 0, 0).latitude, 0);
    db.hr.settings.attendance.enforceAssignedLocations = true;
    db.hr.employeeProfiles.employee.assignedLocationIds = [];
    db.hr.checkInLocations = [
        { id: 'small', latitude: 0.001, longitude: 0, radiusMeters: 20 },
        { id: 'large', latitude: 0.002, longitude: 0, radiusMeters: 300 }
    ];
    assert.equal(policy.attendanceLocation(db, 'employee', 0, 0).nearestLocation.id, 'large');
    db.hr.checkInLocations = [];
    assert.throws(() => policy.attendanceLocation(db, 'employee', 0, 0));
});

test('attendance reads and reassignment respect team ownership', async () => {
    const db = fixture(), today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    db.attendance = [{ id: 'mine', userId: 'employee', date: today }, { id: 'private', userId: 'other', date: today }];
    for (const path of ['/api/attendance/today', '/api/attendance/all']) {
        for (const actor of ['employee', 'lead']) {
            const result = await request(db, actor, path, {}, 'GET');
            assert.deepEqual(result.body.records.map((row: { id: string }) => row.id), ['mine']);
        }
    }
    assert.equal((await request(db, 'stranger', '/api/attendance/reallocate', { attendanceId: 'mine', zone: 'forged' })).status, 403);
    const result = await request(db, 'lead', '/api/attendance/reallocate', { attendanceId: 'mine', zone: 'WH3', by: 'forged' });
    assert.equal(result.status, 200);
    assert.equal(result.body.record.reallocations[0].by, 'Lead');
});

test('HR notifications require exact recipient regardless of claimed role', () => {
    const db = fixture(), employee = db.users[0];
    assert.equal(policy.notificationVisible(db.notifications[0], employee), true);
    assert.equal(policy.notificationVisible(db.notifications[1], employee), false);
    assert.equal(policy.notificationVisible({ module: 'HR', targetRoles: ['Driver'] }, employee), false);
    assert.equal(policy.notificationVisible(db.notifications[0], null), false);
    assert.deepEqual(policy.approvalRecipients(db, 'employee'), ['lead']);
    delete db.hr.employeeProfiles.employee.supervisorId;
    assert.deepEqual(policy.approvalRecipients(db, 'employee'), ['admin']);
    db.hr.employeeProfiles.employee.supervisorId = 'employee';
    assert.deepEqual(policy.approvalRecipients(db, 'employee'), ['admin']);
});

const mobileSource = readFileSync(new URL('../public/legacy/mobile.js', import.meta.url), 'utf8');
const gpsFunction = mobileSource.slice(mobileSource.indexOf('function refreshGpsForAtt()'), mobileSource.indexOf('function handleAttPhotoFile('));
const checkinFunction = mobileSource.slice(mobileSource.indexOf('async function submitAttCheckin()'), mobileSource.indexOf('async function submitSimulatedAttCheckin()'));
const checkoutFunction = mobileSource.slice(mobileSource.indexOf('async function submitAttCheckout()'), mobileSource.indexOf('function showAttResult('));

test('mobile waits for fresh GPS on both actions and never submits stale GPS after denial', async () => {
    for (const action of ['submitAttCheckin', 'submitAttCheckout']) {
        for (const success of [true, false]) {
            const callbacks: { ok?: (position: unknown) => void; error?: () => void } = {};
            const calls: Record<string, unknown>[] = [];
            const state = { gpsLat: 99, gpsLon: 99, photoBase64: 'photo', currentRecord: {} };
            const context = vm.createContext({
                attState: state,
                navigator: { geolocation: { getCurrentPosition: (ok: (position: unknown) => void, error: () => void, options: Record<string, unknown>) => {
                    callbacks.ok = ok; callbacks.error = error;
                    assert.equal(options.maximumAge, 0);
                    assert.equal(options.enableHighAccuracy, true);
                } } },
                currentUser: () => ({ id: 'employee' }),
                $: () => ({ value: '', disabled: false, textContent: '' }),
                api: async (_path: string, payload: Record<string, unknown>) => { calls.push(payload); return { record: {} }; },
                renderAttendanceStatus: () => {}, loadMyAttTasks: () => {},
                showAttResult: () => {}, toast: () => {}, formatBangkokMobile: () => ''
            });
            vm.runInContext(`${gpsFunction}\n${checkinFunction}\n${checkoutFunction}`, context);
            const pending = vm.runInContext(`${action}()`, context);
            assert.equal(calls.length, 0);
            assert.equal(state.gpsLat, null);
            if (success) callbacks.ok?.({ coords: { latitude: 13.7, longitude: 100.5 } });
            else callbacks.error?.();
            await pending;
            assert.equal(calls.length, success ? 1 : 0);
            if (success) {
                assert.equal(calls[0].gpsLat, 13.7);
                assert.equal(calls[0].gpsLon, 100.5);
            } else {
                assert.equal(state.gpsLat, null);
                assert.equal(state.gpsLon, null);
            }
        }
    }
});

test('shared notification routes cannot poll or mark another HR recipient notification', async () => {
    const notificationRoutes = source.slice(source.indexOf('    if (req.method === "GET" && pathname === "/api/notifications/poll")'), source.indexOf('    if (req.method === "GET" && pathname === "/api/taskgroups/my")'));
    const db = fixture();
    const context = vm.createContext({
        req: { method: 'GET', url: '/api/notifications/poll?role=Admin' }, res: {}, pathname: '/api/notifications/poll',
        readDb: () => db, sessionUser: () => db.users[0], hrSecurity: policy, URL,
        parseBody: async () => ({ ids: ['private', 'mine'] }), writeDb: () => {},
        sendJson: (_res: unknown, status: number, body: unknown) => ({ status, body })
    });
    vm.runInContext(`async function run() {${notificationRoutes}}`, context);
    const response = await vm.runInContext('run()', context);
    assert.deepEqual(Array.from(response.body.notifications, (row: { id: string }) => row.id), ['mine']);
    context.req.method = 'POST'; context.pathname = '/api/notifications/mark-read';
    await vm.runInContext('run()', context);
    assert.equal(db.notifications[0].read, true);
    assert.equal(db.notifications[1].read, undefined);
});

test('company policy route is admin-only and persisted changes are audited', async () => {
    const db = fixture(), before = structuredClone(db);
    const payload = { workdays: [1, 2, 3, 4, 5], holidays: ['2026-12-31'], quotas: { sick: 30, personal: 6, vacation: 10, other: 0 }, otRates: { normal: 1.5, holidayWork: 2, holidayOt: 3 }, monthlyOtHoursDivisor: '' };
    assert.equal((await request(db, 'employee', '/api/hr/policy', payload)).status, 403);
    assert.deepEqual(db, before);
    assert.equal((await request(db, 'admin', '/api/hr/policy', payload)).status, 200);
    assert.equal(db.hr.settings.calendar.confirmed, true);
    assert.equal(db.hr.settings.payroll.mode, 'draft_only');
    assert.equal(db.hr.auditLogs[0].actorId, 'admin');
});

test('approval creates missing corrected attendance and cannot cancel or apply it twice', async () => {
    const db = fixture();
    const submitted = await request(db, 'employee', '/api/hr/attendance-correction', { employeeId: 'employee', targetDate: '2026-10-31', requestedCheckIn: '08:00', requestedCheckOut: '17:00', reason: 'Forgot attendance' });
    assert.equal(submitted.status, 201);
    const action = { kind: 'attendance', id: submitted.body.request.id, action: 'approve' };
    assert.equal((await request(db, 'lead', '/api/hr/request-action', action)).status, 200);
    assert.equal((await request(db, 'admin', '/api/hr/request-action', action)).status, 200);
    assert.equal(db.attendance.length, 1);
    const saved = structuredClone(db);
    assert.equal((await request(db, 'admin', '/api/hr/request-action', action)).status, 409);
    assert.equal((await request(db, 'employee', '/api/hr/request-action', { ...action, action: 'cancel' })).status, 409);
    assert.deepEqual(JSON.parse(JSON.stringify(db)), saved);
});

test('failed correction approval leaves request pending and attendance untouched', async () => {
    const db = fixture();
    db.hr.attendanceCorrections.push({ id: 'bad', employeeId: 'employee', status: 'pendingExecutive', targetDate: '2026-10-31', requestedCheckOut: '17:00', reason: 'Forgot' });
    const before = structuredClone(db);
    const result = await request(db, 'admin', '/api/hr/request-action', { kind: 'attendance', id: 'bad', action: 'approve' });
    assert.equal(result.status, 400); assert.equal(result.writes, 0); assert.deepEqual(db, before);
});

test('closing OT applies only to the selected month and excludes own requests', async () => {
    const db = fixture();
    db.hr.otRequests = [
        { id: 'oct', employeeId: 'employee', date: '2026-10-31', status: 'done' },
        { id: 'nov', employeeId: 'employee', date: '2026-11-02', status: 'done' },
        { id: 'own', employeeId: 'admin', date: '2026-11-02', status: 'done' }
    ];
    assert.equal((await request(db, 'admin', '/api/hr/close-month', {})).status, 400);
    const result = await request(db, 'admin', '/api/hr/close-month', { month: '2026-11' });
    assert.equal(result.status, 200); assert.equal(result.body.closed, 1);
    assert.deepEqual(db.hr.otRequests.map((row: { status: string }) => row.status), ['done', 'closed', 'done']);
});

test('longer attendance reports enforce ownership and exclude simulation', async () => {
    const db = fixture();
    db.attendance = [
        { id: 'old', userId: 'employee', date: '2026-01-01' },
        { id: 'simulated', userId: 'employee', date: '2026-01-01', isSimulation: true },
        { id: 'private', userId: 'other', date: '2026-01-01' }
    ];
    const result = await request(db, 'employee', '/api/hr/attendance-history?from=2026-01-01&to=2026-12-31', {}, 'GET');
    assert.equal(result.status, 200); assert.deepEqual(result.body.records.map((row: { id: string }) => row.id), ['old']);
    assert.equal((await request(db, 'employee', '/api/hr/attendance-history?from=2026-01-01&to=2030-01-01', {}, 'GET')).status, 400);
});

test('payroll API creates only a draft even when caller requests paid status', async () => {
    const db = fixture();
    db.hr.payrollProfiles.employee = { employeeId: 'employee', baseSalary: 20000 };
    const payload = { periodStart: '2026-11-01', periodEnd: '2026-11-30', status: 'paid', mode: 'live' };
    assert.equal((await request(db, 'employee', '/api/hr/payroll-run', payload)).status, 403);
    const response = await request(db, 'admin', '/api/hr/payroll-run', payload);
    assert.equal(response.status, 201); assert.equal(response.body.run.status, 'draft');
    assert.equal(response.body.run.mode, 'draft_only'); assert.equal(response.body.run.rows[0].netPay, null);
});
