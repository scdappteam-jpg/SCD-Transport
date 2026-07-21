# คู่มือตั้งค่า Supabase เพื่อให้ทุกคนเห็นข้อมูลเดียวกัน

คู่มือนี้ใช้สำหรับระบบ S.C.D.TRANSPORT บน Render

เป้าหมายคือ: เมื่อ Import ไฟล์ เปิดใบงาน อนุมัติ CS เช็คอินพนักงาน หรือแก้สถานะงาน ข้อมูลจะถูกเก็บไว้ที่ Supabase กลาง และคนอื่นที่เปิดลิงก์เดียวกันจะเห็นข้อมูลชุดเดียวกัน

## 1. สร้างโปรเจกต์ Supabase

1. เข้าเว็บ Supabase
2. สร้าง Project ใหม่ หรือใช้ Project เดิมก็ได้
3. รอให้ Project สร้างเสร็จ
4. ไปที่เมนู SQL Editor

## 2. สร้างตารางเก็บข้อมูลกลาง

ใน SQL Editor ให้กด New query แล้ววางคำสั่งนี้:

```sql
create table if not exists public.app_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;
```

จากนั้นกด Run

ตารางนี้จะเก็บข้อมูลระบบทั้งหมดไว้เป็นก้อนกลาง เช่น ใบงาน, งาน Import, สถานะ CS, attendance, warehouse map และ billing

## 3. เอาค่า Supabase URL และ Service Role Key

ไปที่ Supabase:

1. กด Project Settings
2. เข้าเมนู API
3. คัดลอกค่า `Project URL`
4. คัดลอกค่า `service_role key`

ข้อสำคัญ: ห้ามเอา `service_role key` ไปใส่ในไฟล์หน้าเว็บ หรือส่งให้คนทั่วไป เพราะเป็น key ที่มีสิทธิ์เขียนข้อมูล

## 4. ใส่ค่าใน Render

ไปที่ Render:

1. เปิด Service `SCD-Transport`
2. เข้าเมนู Environment
3. กด Add Environment Variable
4. เพิ่มค่าตามนี้

```text
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR-SERVICE-ROLE-KEY
SUPABASE_STATE_TABLE=app_state
SUPABASE_STATE_ID=scd-transport
```

ตัวอย่าง:

```text
SUPABASE_URL=https://abcdefg.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_STATE_TABLE=app_state
SUPABASE_STATE_ID=scd-transport
```

## 5. Commit และ Deploy

หลังเพิ่มไฟล์และแก้ระบบแล้ว:

1. เปิด GitHub Desktop
2. ตรวจว่ามีไฟล์เปลี่ยนแปลง
3. กด Commit to main
4. กด Push origin
5. ไป Render แล้วกด Manual Deploy

## 6. ตรวจว่าระบบใช้ฐานข้อมูลกลางแล้ว

หลัง Render deploy เสร็จ ให้เปิดลิงก์นี้:

```text
https://scd-transport.onrender.com/api/admin/db-info
```

ถ้าตั้งค่าสำเร็จ จะเห็นข้อความประมาณนี้:

```json
"sharedDatabase": {
  "provider": "supabase",
  "table": "app_state",
  "id": "scd-transport",
  "loaded": true
}
```

ถ้าเห็น `"loaded": true` แปลว่าระบบเชื่อม Supabase แล้ว

## 7. วิธีทดสอบกับคนอื่น

1. คุณเปิดเว็บ Render แล้ว Import ไฟล์หรือเปิดใบงาน 1 รายการ
2. ส่งลิงก์ Render ให้คนอื่น
3. ให้เขารีเฟรชหน้าเว็บ
4. เขาควรเห็นใบงานหรือข้อมูลที่คุณเพิ่ม

ลิงก์ใช้งาน:

```text
https://scd-transport.onrender.com
```

## ถ้ายังไม่เห็นข้อมูล

ให้ตรวจตามนี้:

1. Render deploy ล่าสุดสำเร็จหรือยัง
2. ใส่ `SUPABASE_URL` ถูกต้องหรือไม่
3. ใส่ `SUPABASE_SERVICE_ROLE_KEY` ถูกต้องหรือไม่
4. สร้างตาราง `app_state` ใน Supabase แล้วหรือยัง
5. เปิด `/api/admin/db-info` แล้ว `sharedDatabase.loaded` เป็น `true` หรือไม่
6. คนอื่นอาจต้องกด Refresh หน้าเว็บหนึ่งครั้ง

## หมายเหตุเรื่องไฟล์แนบ

การตั้งค่านี้ทำให้ข้อมูลในระบบแชร์ร่วมกันได้ก่อน เช่น ใบงานและสถานะงาน

แต่ไฟล์แนบจริง เช่น รูปภาพ หลักฐาน Line/Email หรือเอกสารที่ upload ยังอาจต้องแยกไปใช้ Supabase Storage เพิ่มในเฟสถัดไป เพื่อให้ไฟล์แนบเปิดดูได้ถาวรและแชร์ให้ทุกคนเห็นเหมือนกัน
