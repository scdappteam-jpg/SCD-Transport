function reject(message, statusCode = 400) {
    throw Object.assign(new Error(message), { statusCode });
}

function date(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
        reject('วันที่ไม่ถูกต้อง');
    }
    return value;
}

function minutes(value) {
    if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) reject('เวลาไม่ถูกต้อง ต้องเป็น HH:mm');
    const [hours, mins] = value.split(':').map(Number);
    return hours * 60 + mins;
}

function reason(value) {
    const text = String(value || '').trim();
    if (!text || text === '-' || text.length > 2000) reject('กรุณาระบุเหตุผลไม่เกิน 2,000 ตัวอักษร');
    return text;
}

function number(value, label, max = 1000000) {
    if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') reject(`กรุณาระบุ${label}`);
    const result = Number(value);
    if (!Number.isFinite(result) || result < 0 || result > max) reject(`${label}ไม่ถูกต้อง`);
    return result;
}

function policy(db) {
    return {
        workdays: db.hr.settings.calendar?.workdays || [0, 1, 2, 3, 4, 5, 6],
        holidays: db.hr.settings.calendar?.holidays || [],
        calendarConfigured: db.hr.settings.calendar?.confirmed === true,
        quotas: db.hr.settings.quotas || {},
        otRates: db.hr.settings.otRates || {},
        monthlyOtHoursDivisor: db.hr.settings.payroll?.monthlyOtHoursDivisor || null,
        payrollMode: 'draft_only'
    };
}

function calendarDays(startDate, endDate, db) {
    date(startDate); date(endDate);
    const start = Date.parse(`${startDate}T00:00:00Z`), end = Date.parse(`${endDate}T00:00:00Z`);
    if (end < start || (end - start) / 86400000 > 366) reject('ช่วงวันที่ต้องเรียงลำดับและไม่เกิน 367 วัน');
    const config = policy(db), holidays = new Set(config.holidays);
    const days = [];
    for (let at = start; at <= end; at += 86400000) {
        const day = new Date(at), key = day.toISOString().slice(0, 10);
        if (config.workdays.includes(day.getUTCDay()) && !holidays.has(key)) days.push(key);
    }
    return days;
}

const active = request => !['cancelled', 'rejected', 'expired'].includes(request.status);

function leaveDays(db, request) {
    const part = request.part || 'full';
    if (!['full', 'am', 'pm'].includes(part)) reject('ช่วงเวลาลาไม่ถูกต้อง');
    if (part !== 'full' && request.endDate !== request.startDate) reject('การลาครึ่งวันต้องเป็นวันเดียวกัน');
    return calendarDays(request.startDate, request.endDate, db).map(day => ({ day, amount: part === 'full' ? 1 : 0.5 }));
}

function balance(db, employeeId, type, year, excludeId) {
    const quota = Number(policy(db).quotas[type] || 0);
    let approved = 0, reserved = 0;
    for (const request of db.hr.leaveRequests || []) {
        if (request.id === excludeId || request.employeeId !== employeeId || request.type !== type || !active(request)) continue;
        // Historical requests without snapshots retain their saved calendar-day basis.
        const days = request.dayEntries || historicalDays(request);
        const amount = days.filter(item => item.day.startsWith(`${year}-`)).reduce((sum, item) => sum + item.amount, 0);
        if (request.status === 'approved') approved += amount;
        else reserved += amount;
    }
    return { year: String(year), type, quota, approved, reserved, remaining: Math.max(0, quota - approved - reserved), limited: type !== 'other' || quota > 0 };
}

function historicalDays(request) {
    const start = Date.parse(`${request.startDate}T00:00:00Z`), end = Date.parse(`${request.endDate || request.startDate}T00:00:00Z`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 366 * 86400000) return [];
    const result = [];
    for (let at = start; at <= end; at += 86400000) result.push({ day: new Date(at).toISOString().slice(0, 10), amount: request.part && request.part !== 'full' ? 0.5 : 1 });
    return result;
}

function checkLeave(db, payload, excludeId) {
    if (!['sick', 'personal', 'vacation', 'other'].includes(payload.type)) reject('ประเภทการลาไม่ถูกต้อง');
    const entries = excludeId && payload.dayEntries ? payload.dayEntries : leaveDays(db, payload);
    if (!entries.length) reject('ช่วงวันที่เลือกไม่มีวันทำงาน');
    for (const existing of db.hr.leaveRequests || []) {
        if (existing.id === excludeId || existing.employeeId !== payload.employeeId || !active(existing)) continue;
        const oldDays = existing.dayEntries || historicalDays(existing);
        if (entries.some(item => oldDays.some(old => old.day === item.day)) &&
            ((payload.part || 'full') === 'full' || (existing.part || 'full') === 'full' || payload.part === existing.part)) {
            reject('มีคำขอลาในช่วงเวลาเดียวกันแล้ว', 409);
        }
    }
    const years = [...new Set(entries.map(item => item.day.slice(0, 4)))];
    for (const year of years) {
        const available = balance(db, payload.employeeId, payload.type, year, excludeId);
        const requested = entries.filter(item => item.day.startsWith(`${year}-`)).reduce((sum, item) => sum + item.amount, 0);
        if (available.limited && requested > available.remaining) reject(`วันลาคงเหลือปี ${year} ไม่เพียงพอ (เหลือ ${available.remaining} วัน)`, 409);
    }
    return { dayEntries: entries, days: entries.reduce((sum, item) => sum + item.amount, 0), reason: reason(payload.reason),
        remainingQuotaAtSubmit: balance(db, payload.employeeId, payload.type, years[0], excludeId).remaining };
}

function otInterval(request) {
    date(request.date);
    const startMinutes = minutes(request.startTime), endMinutes = minutes(request.endTime);
    if (startMinutes === endMinutes) reject('เวลาเริ่มและสิ้นสุด OT ต้องต่างกัน');
    const start = Date.parse(`${request.date}T00:00:00+07:00`) + startMinutes * 60000;
    const end = start + ((endMinutes - startMinutes + 1440) % 1440) * 60000;
    return { start, end, hours: Math.round((end - start) / 360000) / 10 };
}

function checkOt(db, payload) {
    const interval = otInterval(payload);
    for (const existing of db.hr.otRequests || []) {
        if (existing.employeeId !== payload.employeeId || !active(existing)) continue;
        let previous;
        try { previous = otInterval(existing); } catch { continue; }
        if (interval.start < previous.end && interval.end > previous.start) reject('มีคำขอ OT ซ้อนกันแล้ว', 409);
    }
    const type = payload.otType || 'normal';
    if (!['normal', 'holidayWork', 'holidayOt'].includes(type)) reject('ประเภท OT ไม่ถูกต้อง');
    return { requestedHours: interval.hours, reason: reason(payload.reason), otType: type,
        rate: number(policy(db).otRates[type] ?? ({ normal: 1.5, holidayWork: 2, holidayOt: 3 })[type], 'อัตรา OT', 10) };
}

function checkCorrection(db, payload, excludeId) {
    date(payload.targetDate);
    if (!payload.requestedCheckIn && !payload.requestedCheckOut) reject('ระบุเวลาเข้างานหรือออกงานอย่างน้อยหนึ่งรายการ');
    if (payload.requestedCheckIn) minutes(payload.requestedCheckIn);
    if (payload.requestedCheckOut) minutes(payload.requestedCheckOut);
    if (payload.requestedCheckIn && payload.requestedCheckOut && minutes(payload.requestedCheckOut) <= minutes(payload.requestedCheckIn)) {
        reject('เวลาออกต้องหลังเวลาเข้า การแก้ไขกะข้ามวันต้องตรวจสอบแยกโดย HR');
    }
    if ((db.hr.attendanceCorrections || []).some(item => item.id !== excludeId && item.employeeId === payload.employeeId && item.targetDate === payload.targetDate && ['pendingLead', 'pendingExecutive'].includes(item.status))) {
        reject('มีคำขอแก้ไขเวลาวันนี้รออนุมัติอยู่แล้ว', 409);
    }
    return { reason: reason(payload.reason) };
}

function applyCorrection(db, request, at) {
    checkCorrection(db, request, request.id);
    db.attendance ||= [];
    const records = db.attendance.filter(item => item.userId === request.employeeId && item.date === request.targetDate && !item.isSimulation);
    if (records.length > 1) reject('มีหลายรายการลงเวลาในวันนี้ ต้องตรวจสอบก่อนอนุมัติแก้ไข', 409);
    const existing = records[0];
    const time = value => `${request.targetDate}T${value}:00+07:00`;
    const checkIn = request.requestedCheckIn ? time(request.requestedCheckIn) : existing?.checkInTime;
    const checkOut = request.requestedCheckOut ? time(request.requestedCheckOut) : existing?.checkOutTime;
    if (!checkIn) reject('ยังไม่มีเวลาเข้างาน กรุณาระบุเวลาเข้าด้วย');
    if (checkOut && Date.parse(checkOut) <= Date.parse(checkIn)) reject('เวลาออกต้องหลังเวลาเข้า');
    const record = existing || { id: `ATC-${request.id}`, userId: request.employeeId, userName: db.users.find(user => user.id === request.employeeId)?.name || request.employeeId, date: request.targetDate, checkInPhoto: null, checkOutPhoto: null };
    const before = { checkInTime: record.checkInTime || null, checkOutTime: record.checkOutTime || null };
    Object.assign(record, { checkInTime: checkIn, checkOutTime: checkOut || null, status: checkOut ? 'checkout' : 'checkin', attendanceStatus: 'approved_correction', correctionRequestId: request.id, correctionAppliedAt: at });
    record.correctionHistory = [...(record.correctionHistory || []), { requestId: request.id, before, after: { checkInTime: checkIn, checkOutTime: checkOut || null }, at }];
    if (!existing) db.attendance.push(record);
    return record;
}

function audit(db, actor, path, payload, at) {
    db.hr.auditLogs ||= [];
    db.hr.auditLogs.push({ id: `HRA-${db.hr.auditLogs.length + 1}-${at}`, at, actorId: actor.id,
        action: path.split('/').pop(), entityId: payload.id || payload.employeeId || payload.month || '', detail: payload.action || '' });
}

function savePolicy(db, payload, actor, at) {
    if (!Array.isArray(payload.workdays) || !payload.workdays.length || payload.workdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) reject('เลือกวันทำงานอย่างน้อยหนึ่งวัน');
    if (!Array.isArray(payload.holidays) || payload.holidays.length > 366) reject('วันหยุดไม่ถูกต้อง');
    const holidays = [...new Set(payload.holidays.map(date))].sort();
    const quotas = Object.fromEntries(['sick', 'personal', 'vacation', 'other'].map(type => [type, number(payload.quotas?.[type], 'โควตาลา', 366)]));
    const otRates = Object.fromEntries(['normal', 'holidayWork', 'holidayOt'].map(type => [type, number(payload.otRates?.[type], 'อัตรา OT', 10)]));
    const divisor = payload.monthlyOtHoursDivisor === '' || payload.monthlyOtHoursDivisor == null ? null : number(payload.monthlyOtHoursDivisor, 'ฐานชั่วโมงรายเดือน', 744);
    if (divisor === 0) reject('ฐานชั่วโมงรายเดือนต้องมากกว่า 0');
    // All validation finishes before any persisted settings are changed.
    Object.assign(db.hr.settings, { quotas, otRates, calendar: { workdays: [...new Set(payload.workdays)].sort(), holidays, confirmed: true },
        payroll: { monthlyOtHoursDivisor: divisor, mode: 'draft_only' }, updatedBy: actor.id, updatedAt: at });
    return policy(db);
}

function validateProfile(db, payload) {
    const users = db.users || [];
    const supervisorId = String(payload.supervisorId || '');
    if (supervisorId && !users.some(user => user.id === supervisorId && !['Inactive', 'Resigned'].includes(user.status))) reject('ไม่พบหัวหน้างานที่ใช้งานอยู่');
    const visited = new Set([payload.employeeId]);
    let current = supervisorId;
    while (current) {
        if (visited.has(current)) reject('สายบังคับบัญชาวนกลับมาที่พนักงานเดิม');
        visited.add(current);
        current = db.hr.employeeProfiles?.[current]?.supervisorId || '';
    }
    if (payload.startDate) date(payload.startDate);
    if (payload.assignedLocationIds != null && (!Array.isArray(payload.assignedLocationIds) || payload.assignedLocationIds.some(id => !(db.hr.checkInLocations || []).some(location => location.id === id)))) {
        reject('มีจุดลงเวลาที่ไม่พบในระบบ');
    }
}

function readiness(db) {
    const employees = (db.users || []).filter(user => !['Inactive', 'Resigned'].includes(user.status));
    const locations = (db.hr.checkInLocations || []).filter(location => location.active !== false);
    const withoutSupervisor = employees.filter(user => !['Admin', 'Executive'].includes(user.role) && !(db.users || []).some(supervisor => supervisor.id !== user.id && supervisor.id === db.hr.employeeProfiles?.[user.id]?.supervisorId));
    const missingLocations = employees.filter(user => !(db.hr.employeeProfiles?.[user.id]?.assignedLocationIds || []).some(id => locations.some(location => location.id === id)));
    return { payrollMode: 'draft_only', checks: [
        { key: 'calendar', ok: policy(db).calendarConfigured, label: 'ยืนยันวันทำงาน วันหยุด และโควตาลา' },
        { key: 'gps', ok: db.hr.settings.attendance?.enforceAssignedLocations === true && locations.length > 0, label: 'เปิดบังคับ GPS และมีจุดลงเวลา' },
        { key: 'supervisors', ok: !withoutSupervisor.length, label: 'กำหนดหัวหน้างาน', employeeIds: withoutSupervisor.map(user => user.id) },
        { key: 'locations', ok: !missingLocations.length, label: 'ผูกจุดลงเวลารายพนักงาน', employeeIds: missingLocations.map(user => user.id) }
    ] };
}

function payrollPreview(db, start, end) {
    date(start); date(end);
    if (end < start) reject('วันสิ้นสุดรอบต้องไม่ก่อนวันเริ่มต้น');
    const divisor = policy(db).monthlyOtHoursDivisor;
    const warnings = ['ร่างตรวจสอบเท่านั้น ยังไม่รวมการหักขาดงาน ภาษี ประกันสังคม และการปรับรายเดือน'];
    if (!divisor) warnings.push('ยังไม่ยืนยันฐานชั่วโมงรายเดือน จึงยังไม่คำนวณค่า OT และยอดสุทธิ');
    const rows = Object.values(db.hr.payrollProfiles || {}).map(profile => {
        const requests = (db.hr.otRequests || []).filter(item => item.employeeId === profile.employeeId && item.status === 'closed' && item.date >= start && item.date <= end);
        const otHours = requests.reduce((sum, item) => sum + Number(item.paidHours || 0), 0);
        const baseSalary = number(profile.baseSalary, 'ฐานเงินเดือน');
        const fixedAllowance = number(profile.fixedAllowance ?? 0, 'รายรับประจำ');
        const fixedDeduction = number(profile.fixedDeduction ?? 0, 'รายการหักประจำ');
        const ratesKnown = requests.every(item => Number.isFinite(Number(item.rate)) && Number(item.rate) >= 0);
        const otAmount = divisor && ratesKnown ? Math.round(requests.reduce((sum, item) => sum + baseSalary / divisor * Number(item.rate) * Number(item.paidHours || 0), 0) * 100) / 100 : null;
        const grossPay = otAmount === null ? null : Math.round((baseSalary + fixedAllowance + otAmount) * 100) / 100;
        return { employeeId: profile.employeeId, baseSalary, fixedAllowance, fixedDeduction, otHours, otAmount,
            grossPay, netPay: grossPay === null ? null : Math.round((grossPay - fixedDeduction) * 100) / 100,
            warning: !ratesKnown ? 'รายการ OT เดิมไม่มีอัตราที่ตรวจสอบได้' : '' };
    });
    if (!rows.length) reject('ยังไม่มีข้อมูลเงินเดือนพนักงาน');
    return { rows, warnings, policySnapshot: policy(db), mode: 'draft_only' };
}

module.exports = { date, minutes, number, policy, calendarDays, balance, checkLeave, checkOt, checkCorrection, applyCorrection, audit, savePolicy, validateProfile, readiness, payrollPreview };
