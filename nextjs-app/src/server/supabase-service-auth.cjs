/* Server-side API keys identify the application, not an end-user session.
 * Opaque sb_secret_/sb_publishable_ keys belong in apikey only; they are not JWTs.
 * https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys
 */
/** @param {Record<string, string | undefined>} env */
function serviceKey(env = process.env) {
    return env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY
        || env.SUPABASE_SERVICE_KEY || env.SUPABASE_API_KEY || env.SUPABASE_ANON_KEY || '';
}

function serviceHeaders(key) {
    const headers = { apikey: key };
    if (key && !/^sb_(secret|publishable)_/.test(key)) headers.Authorization = `Bearer ${key}`;
    return headers;
}

function syncErrorHint(message) {
    const text = String(message || '');
    if (/JWT issued at future|JWT.*not yet valid/i.test(text))
        return 'Supabase ปฏิเสธ JWT เพราะเวลาออกบัตรอยู่ในอนาคต — ตรวจนาฬิกาและใช้ Secret key รุ่นใหม่';
    if (/JWT expired/i.test(text))
        return 'JWT สำหรับเชื่อม Supabase หมดอายุ — ตรวจคีย์ที่กำหนดใน Render';
    if (/PGRST303|Invalid JWT/i.test(text))
        return 'Supabase ตรวจสอบ JWT ไม่ผ่าน — ตรวจรายละเอียดข้อผิดพลาดและชนิดคีย์ใน Render';
    if (/401|403|Invalid API key/i.test(text))
        return 'Supabase ปฏิเสธคีย์หรือสิทธิ์ — ตรวจการตั้งค่าใน Render ก่อนลองซิงก์ใหม่';
    if (/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|timeout|deadline exceeded/i.test(text))
        return 'เชื่อมต่อ Supabase ขัดข้องหรือหมดเวลา — ระบบเก็บข้อมูลรอซิงก์และจะลองใหม่';
    return 'ซิงก์ข้อมูลขึ้นฐานข้อมูลกลางไม่สำเร็จ';
}

module.exports = { serviceKey, serviceHeaders, syncErrorHint };
