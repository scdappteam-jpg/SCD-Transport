import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const require = createRequire(import.meta.url);
const hr = require('../src/server/hr-workflows.cjs');
const actor = { id: 'admin', name: 'Admin', role: 'Admin' };
const at = '2026-11-03T03:00:00Z';

function fixture() {
    return JSON.parse(JSON.stringify({ users: [{ id: 'e', name: 'Employee', role: 'Driver' }, actor], attendance: [],
        hr: { employeeProfiles: {}, checkInLocations: [], leaveRequests: [], otRequests: [], attendanceCorrections: [],
            payrollProfiles: { e: { employeeId: 'e', baseSalary: 30000, fixedAllowance: 500, fixedDeduction: 200 } },
            settings: { quotas: { sick: 30, personal: 6, vacation: 10, other: 0 }, otRates: { normal: 1.5, holidayWork: 2, holidayOt: 3 } } } }));
}
function configuration() {
    return { workdays: [1, 2, 3, 4, 5], holidays: ['2026-11-04'], quotas: { sick: 30, personal: 6, vacation: 10, other: 0 },
        otRates: { normal: 1.5, holidayWork: 2, holidayOt: 3 }, monthlyOtHoursDivisor: '' };
}
const leave = { employeeId: 'e', startDate: '2026-11-02', endDate: '2026-11-06', type: 'personal', part: 'full', reason: 'Family matter' };

test('policy rejects invalid dates, empty workweeks and malformed amounts atomically', () => {
    for (const change of [{ workdays: [] }, { holidays: ['2026-02-29'] }, { workdays: [true] }, { quotas: { sick: -1 } }, { monthlyOtHoursDivisor: 0 }]) {
        const db = fixture(), before = structuredClone(db);
        assert.throws(() => hr.savePolicy(db, { ...configuration(), ...change }, actor, at));
        assert.deepEqual(db, before);
    }
    assert.equal(hr.date('2028-02-29'), '2028-02-29');
    for (const value of ['2026-11-31', '2026-1-01', null, true]) assert.throws(() => hr.date(value));
});

test('configured leave excludes weekends and holidays and stores a day snapshot', () => {
    const db = fixture(); hr.savePolicy(db, configuration(), actor, at);
    const result = hr.checkLeave(db, { ...leave, endDate: '2026-11-08' });
    assert.equal(result.days, 4);
    assert.deepEqual(result.dayEntries.map((entry: { day: string }) => entry.day), ['2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06']);
    assert.throws(() => hr.checkLeave(db, { ...leave, startDate: '2026-11-07', endDate: '2026-11-08' }));
    assert.throws(() => hr.checkLeave(db, { ...leave, part: 'am' }));
});

test('leave is reserved server-side, cancellation restores it and years are independent', () => {
    const db = fixture();
    const request = { ...leave, id: 'l1', status: 'pendingLead', ...hr.checkLeave(db, leave) };
    db.hr.leaveRequests.push(request);
    assert.equal(hr.balance(db, 'e', 'personal', '2026').remaining, 1);
    assert.throws(() => hr.checkLeave(db, { ...leave, startDate: '2026-11-10', endDate: '2026-11-11', remainingQuotaAtSubmit: 999 }), /คงเหลือ/);
    assert.equal(hr.checkLeave(db, { ...leave, startDate: '2027-11-02', endDate: '2027-11-03' }).days, 2);
    request.status = 'cancelled';
    assert.equal(hr.balance(db, 'e', 'personal', '2026').remaining, 6);
});

test('cross-year requests allocate annual quota to each actual year', () => {
    const db = fixture(); db.hr.settings.quotas.personal = 1;
    const request = { ...leave, startDate: '2026-12-31', endDate: '2027-01-01' };
    const result = hr.checkLeave(db, request);
    assert.equal(result.days, 2);
    db.hr.leaveRequests.push({ ...request, ...result, id: 'cross', status: 'approved' });
    assert.equal(hr.balance(db, 'e', 'personal', '2026').approved, 1);
    assert.equal(hr.balance(db, 'e', 'personal', '2027').approved, 1);
});

test('AM and PM coexist while whole-day and duplicate half-day requests conflict', () => {
    const db = fixture(), request = { ...leave, endDate: leave.startDate, part: 'am' };
    db.hr.leaveRequests.push({ ...request, ...hr.checkLeave(db, request), id: 'am', status: 'pendingLead' });
    assert.equal(hr.checkLeave(db, { ...request, part: 'pm' }).days, 0.5);
    assert.throws(() => hr.checkLeave(db, request), /เดียวกัน/);
    assert.throws(() => hr.checkLeave(db, { ...request, type: 'sick', part: 'full' }), /เดียวกัน/);
});

test('approval respects reserved day snapshot even after holidays change', () => {
    const db = fixture(), request = { ...leave, id: 'l1', status: 'pendingExecutive', ...hr.checkLeave(db, leave) };
    db.hr.leaveRequests.push(request);
    hr.savePolicy(db, configuration(), actor, at);
    assert.equal(hr.checkLeave(db, request, request.id).days, 5);
});

test('OT validates real clock times, midnight overlaps and preserves configured type rate', () => {
    const db = fixture(), request = { employeeId: 'e', date: '2026-11-02', startTime: '23:00', endTime: '01:00', otType: 'holidayOt', reason: 'Loading' };
    const checked = hr.checkOt(db, request);
    assert.equal(checked.requestedHours, 2); assert.equal(checked.rate, 3);
    db.hr.otRequests.push({ ...request, ...checked, id: 'ot', status: 'pendingLead' });
    assert.throws(() => hr.checkOt(db, { ...request, date: '2026-11-03', startTime: '00:30', endTime: '02:00' }), /ซ้อน/);
    assert.equal(hr.checkOt(db, { ...request, date: '2026-11-03', startTime: '01:00', endTime: '02:00' }).requestedHours, 1);
    for (const time of ['24:00', '10:60', '1:00', '', true]) assert.throws(() => hr.checkOt(db, { ...request, startTime: time }));
});

test('approved correction creates missing attendance and preserves before/after history', () => {
    const db = fixture(), request = { id: 'fix', employeeId: 'e', targetDate: '2026-11-02', requestedCheckIn: '08:00', requestedCheckOut: '17:00', reason: 'Forgot check-in' };
    hr.applyCorrection(db, request, at);
    assert.equal(db.attendance.length, 1);
    assert.equal(db.attendance[0].status, 'checkout');
    assert.equal(db.attendance[0].correctionHistory[0].before.checkInTime, null);
    const original = db.attendance[0].checkInTime;
    hr.applyCorrection(db, { ...request, id: 'fix2', requestedCheckIn: '08:30' }, at);
    assert.equal(db.attendance[0].correctionHistory[1].before.checkInTime, original);
    assert.equal(db.attendance[0].correctionHistory.length, 2);
});

test('ambiguous or contradictory attendance correction fails before mutation', () => {
    const request = { id: 'fix', employeeId: 'e', targetDate: '2026-11-02', requestedCheckIn: '08:00', requestedCheckOut: '17:00', reason: 'Correction' };
    for (const rows of [[{ userId: 'e', date: request.targetDate }, { userId: 'e', date: request.targetDate }], []]) {
        const db = fixture(); db.attendance = rows;
        const before = structuredClone(db);
        assert.throws(() => hr.applyCorrection(db, rows.length ? request : { ...request, requestedCheckIn: '' }, at));
        assert.deepEqual(db, before);
    }
});

test('payroll stays draft-only, uses only closed OT and never substitutes zero for missing configuration', () => {
    const db = fixture();
    db.hr.otRequests = [{ employeeId: 'e', date: '2026-11-02', status: 'closed', paidHours: 2, rate: 1.5 },
        { employeeId: 'e', date: '2026-11-02', status: 'approved', requestedHours: 10, rate: 3 }];
    const unknown = hr.payrollPreview(db, '2026-11-01', '2026-11-30');
    assert.equal(unknown.mode, 'draft_only'); assert.equal(unknown.rows[0].otAmount, null); assert.equal(unknown.rows[0].netPay, null);
    hr.savePolicy(db, { ...configuration(), monthlyOtHoursDivisor: 240 }, actor, at);
    const known = hr.payrollPreview(db, '2026-11-01', '2026-11-30');
    assert.equal(known.rows[0].otHours, 2); assert.equal(known.rows[0].otAmount, 375); assert.equal(known.rows[0].netPay, 30675);
    assert.equal(known.policySnapshot.monthlyOtHoursDivisor, 240);
});

test('supervisor cycles and unknown location assignments cannot be saved', () => {
    const db = fixture();
    db.hr.employeeProfiles.admin = { supervisorId: 'e' };
    for (const supervisorId of ['e', 'admin', 'unknown']) assert.throws(() => hr.validateProfile(db, { employeeId: 'e', supervisorId }));
    assert.throws(() => hr.validateProfile(db, { employeeId: 'e', assignedLocationIds: ['unknown'] }));
    hr.validateProfile(db, { employeeId: 'e', supervisorId: '', assignedLocationIds: [] });
});

test('readiness exposes missing setup and audit omits sensitive submitted values', () => {
    const db = fixture();
    assert.ok(hr.readiness(db).checks.some((check: { ok: boolean }) => !check.ok));
    hr.audit(db, actor, '/api/hr/payroll-profile', { employeeId: 'e', baseSalary: 999999, bankAccount: 'secret' }, at);
    assert.equal(db.hr.auditLogs[0].actorId, 'admin');
    assert.ok(!JSON.stringify(db.hr.auditLogs).includes('999999'));
    assert.ok(!JSON.stringify(db.hr.auditLogs).includes('secret'));
});

test('partial HR responses preserve profiles and payroll in browser state', () => {
    const source = readFileSync(new URL('../public/legacy/app.js', import.meta.url), 'utf8');
    const fn = source.slice(source.indexOf('function applyHrData('), source.indexOf('async function loadHrData('));
    const state = { hrEmployeeProfiles: { e: { department: 'Transport' } }, hrPayrollRuns: [{ id: 'draft' }], leaveRequests: [] };
    const context = vm.createContext({ state }); vm.runInContext(fn, context);
    vm.runInContext('applyHrData({ leaveRequests: [{ id: "l1" }] })', context);
    assert.equal(state.hrEmployeeProfiles.e.department, 'Transport');
    assert.equal(state.hrPayrollRuns[0].id, 'draft');
    assert.equal(state.leaveRequests.length, 1);
});

test('report clips leave to range, counts unique days and keeps zero actual OT as zero', () => {
    const source = readFileSync(new URL('../public/legacy/app.js', import.meta.url), 'utf8');
    const functions = source.slice(source.indexOf('function hrReportRows()'), source.indexOf('async function renderHrReport()'));
    const filter = { from: '2026-11-01', to: '2026-11-30', dept: '', employees: [], type: 'all' };
    const context = vm.createContext({
        hrReportFilter: filter, hrSeedRequests: () => {}, hrEmployees: () => [{ id: 'e', name: 'Employee' }],
        hrCanManageCore: () => false, currentWebUser: () => ({ id: 'e' }), hrDeptOf: () => 'Transport',
        hrInRange: (day: string) => day >= filter.from && day <= filter.to,
        state: {
            leaveRequests: [{ employeeId: 'e', status: 'approved', type: 'personal', startDate: '2026-10-31', endDate: '2026-11-02', days: 3 }],
            otRequests: [{ employeeId: 'e', status: 'done', date: '2026-11-02', paidHours: 0, requestedHours: 99 },
                { employeeId: 'e', status: 'approved', date: '2026-11-02', requestedHours: 10 }],
            attendanceAll: [{ userId: 'e', date: '2026-11-02' }, { userId: 'e', date: '2026-11-02' }, { userId: 'e', date: '2026-11-03', isSimulation: true }]
        }
    });
    vm.runInContext(functions, context);
    const rows = vm.runInContext('hrReportRows()', context);
    assert.equal(rows[0].personal, 2); assert.equal(rows[0].otHours, 0); assert.equal(rows[0].workDays, 1);
    assert.equal(rows[0].otPay, null);
});

test('company setup renders readiness, policy controls and safe draft amounts', () => {
    const source = readFileSync(new URL('../public/legacy/app.js', import.meta.url), 'utf8');
    const render = source.slice(source.indexOf('function renderHrOperationsSetup()'), source.indexOf('async function saveHrCompanyPolicy('));
    let removed = false;
    const panel = { innerHTML: '', remove: () => { removed = true; } };
    const context = vm.createContext({
        document: { getElementById: () => panel }, hrCanManageCore: () => true,
        safeHtml: (value: unknown) => String(value).replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
        HR_LEAVE_TYPES: { sick: { th: 'ลาป่วย' } }, hrEmployeeName: (id: string) => id, formatDateTime: (value: string) => value,
        state: { hrPolicy: {}, hrSettings: { quotas: {}, otRates: {} },
            hrReadiness: { checks: [{ key: 'calendar', label: 'ยืนยันนโยบาย', ok: false }] },
            hrPayrollRuns: [{ periodStart: '2026-11-01', periodEnd: '2026-11-30', warnings: ['<script>'], rows: [{ employeeId: 'e', otHours: 2, otAmount: null, netPay: null }] }] }
    });
    vm.runInContext(render + '\nrenderHrOperationsSetup()', context);
    assert.match(panel.innerHTML, /hrMonthlyOtDivisor/); assert.match(panel.innerHTML, /hrCompanyHolidays/);
    assert.match(panel.innerHTML, /ยังไม่คำนวณ/); assert.ok(!panel.innerHTML.includes('<script>'));
    context.hrCanManageCore = () => false;
    vm.runInContext('renderHrOperationsSetup()', context);
    assert.equal(removed, true);
});
