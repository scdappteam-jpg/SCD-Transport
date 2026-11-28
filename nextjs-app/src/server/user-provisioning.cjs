/* eslint-disable @typescript-eslint/no-require-imports */
const crypto = require('node:crypto');
const auth = require('./attendance-device-auth.cjs');
const ROLES = ['Admin','Executive','CS','Team_Transport','Driver','WH3_TeamLeader','WH_Staff','Tagging_Staff','QA_Inspector','Check_House','Console_Office','EI_Customer','Terminal','Billing','Employee','People_Viewer'];
const fail = (message, statusCode=400) => { throw Object.assign(new Error(message), {statusCode}); };
function initializeCredential(user, pin, at) {
    auth.validatePin(pin,user);
    user.passwordHash=auth.pinHash(pin);
    user.pinHash=auth.pinHash(pin);
    user.mustChangePassword=true;
    user.mustChangePin=true;
    user.initialCredentialRequired=true;
    user.pinUpdatedAt=at;
}
function provisionSuite(db, actor, at) {
    if(actor?.role!=='Admin') fail('เฉพาะ Admin สร้างชุดบัญชีทดสอบได้',403);
    const rows=ROLES.map((role,index)=>({role,code:`SIT${String(index+1).padStart(3,'0')}`}));
    for(const row of rows){
        const matches=(db.users||[]).filter(u=>String(u.code||'').toUpperCase()===row.code);
        if(matches.length>1 || matches.some(u=>!u.isTestAccount || u.role!==row.role)) fail(`รหัส ${row.code} ถูกใช้งานแล้ว ไม่สามารถเขียนทับ`,409);
        if(!matches.length && (db.users||[]).some(u=>u.id===`sit-role-${row.role.toLowerCase()}`)) fail('รหัสบัญชีทดสอบซ้ำ',409);
    }
    db.users ||= [];
    db.hr ||= {}; db.hr.employeeProfiles ||= {}; db.hr.auditLogs ||= [];
    return rows.map(row=>{
        const existing=db.users.find(u=>u.code===row.code);
        if(existing) return {...row,created:false,initialPin:null};
        const user={id:`sit-role-${row.role.toLowerCase()}`,code:row.code,name:`SIT ทดสอบ ${row.role}`,role:row.role,status:'Active',isTestAccount:true,createdAt:at,updatedAt:at};
        if(db.users.some(u=>u.id===user.id)) fail('รหัสบัญชีทดสอบซ้ำ',409);
        let pin;
        do {pin=String(crypto.randomInt(100000,1000000));} while(['123456','654321'].includes(pin) || /^(\d)\1{5}$/.test(pin));
        initializeCredential(user,pin,at);
        db.users.push(user);
        db.hr.employeeProfiles[user.id]={employeeId:user.id,position:row.role,department:'SIT ทดสอบ',updatedAt:at};
        db.hr.auditLogs.push({action:'TestAccountCreated',actorId:actor.id,employeeId:user.id,at});
        return {...row,created:true,initialPin:pin};
    });
}
// Admin re-issues a fresh code for every active SIT role account. The code is
// both the password and the attendance PIN; old sessions, device bindings and
// failed-PIN lockouts are cleared so the account works on phone and desktop.
function randomPin(){let pin;do{pin=String(crypto.randomInt(100000,1000000));}while(['123456','654321'].includes(pin)||/^(\d)\1{5}$/.test(pin));return pin;}
function reissueSuite(db, actor, at) {
    if(actor?.role!=='Admin') fail('เฉพาะ Admin ออกรหัสบัญชีทดสอบใหม่ได้',403);
    const users=(db.users||[]).filter(u=>u.isTestAccount===true&&String(u.id).startsWith('sit-role-')&&u.status!=='Inactive');
    if(!users.length) fail('ยังไม่มีบัญชีทดสอบ ให้กดสร้างบัญชีทดสอบครบทุกบทบาทก่อน',404);
    const ids=new Set(users.map(u=>u.id));
    for(const binding of db.attendanceDeviceBindings||[]){
        if(ids.has(binding.userId)&&binding.status==='Active')Object.assign(binding,{status:'Reset',resetAt:at,resetBy:actor.id,resetReason:'TestCredentialReissued'});
    }
    db.deviceLoginAttempts=(db.deviceLoginAttempts||[]).filter(a=>!ids.has(a.userId));
    db.authSessions=(db.authSessions||[]).filter(s=>!ids.has(s.userId));
    db.hr ||= {}; db.hr.auditLogs ||= [];
    return users.map(user=>{
        const pin=randomPin();
        initializeCredential(user,pin,at);
        Object.assign(user,{passwordChangedAt:at,pinFailedAttempts:0,pinLockedUntil:'',updatedAt:at});
        db.hr.auditLogs.push({action:'TestCredentialReissued',actorId:actor.id,employeeId:user.id,at});
        return {id:user.id,code:user.code,role:user.role,initialPin:pin};
    });
}
module.exports={ROLES,initializeCredential,provisionSuite,reissueSuite};
