# คู่มือตั้งค่า n8n ดึงไฟล์จาก Gmail เข้า S.C.D.TRANSPORT

ไฟล์ workflow อยู่ที่ `docs/n8n-gmail-import-workflow.json`

## สิ่งที่ workflow ทำ

1. ตรวจ Gmail ทุก 30 นาที
2. หาอีเมลที่มีไฟล์แนบ และหัวข้อ/ไฟล์เกี่ยวกับ `Consol Planning`, `Pickup Report`, `.xlsx`, `.csv`
3. ดาวน์โหลดไฟล์แนบ
4. แปลงไฟล์แนบเป็น Base64
5. ส่งเข้า SCD API: `/api/integrations/n8n-email`
6. ระบบ SCD จะตรวจ hash ของไฟล์เพื่อกันไฟล์ซ้ำ
7. ถ้าเป็นไฟล์ใหม่ ระบบจะ import งาน และสร้าง alert ในระบบ
8. ถ้ามีงานใหม่/ข้อมูลเปลี่ยน/ไฟล์ผิดพลาด n8n จะส่งอีเมลสรุปกลับ

## ตั้งค่าใน SCD / Render

เพิ่ม Environment Variable ใน Render หรือ `.env`

```env
N8N_WEBHOOK_KEY=ตั้งค่าเป็นรหัสลับยาวๆ
```

ถ้าใช้ workflow นี้ใน n8n ให้ตั้ง Environment Variable ใน n8n ด้วย:

```env
SCD_APP_URL=https://scd-transport.onrender.com
SCD_N8N_WEBHOOK_KEY=ค่าเดียวกับ N8N_WEBHOOK_KEY ใน Render
SCD_NOTIFY_EMAIL=อีเมลที่จะรับสรุป เช่น yourname@example.com
```

สำคัญ: `SCD_N8N_WEBHOOK_KEY` ใน n8n ต้องตรงกับ `N8N_WEBHOOK_KEY` ในระบบ SCD

## วิธีนำเข้า workflow ใน n8n

1. เข้า n8n
2. ไปที่ `Workflows`
3. กด `Import from File`
4. เลือกไฟล์ `nextjs-app/docs/n8n-gmail-import-workflow.json`
5. เปิด node `Gmail Trigger - Planning Emails`
6. เลือก/สร้าง Gmail OAuth2 credential
7. เปิด node `Send Summary Email`
8. เลือก Gmail OAuth2 credential เดียวกัน
9. กด `Execute workflow` เพื่อทดสอบ
10. ถ้าทดสอบผ่าน ให้กด `Active`

## ตั้งค่า Gmail Filter

ค่าเริ่มต้นใน workflow:

```text
has:attachment (subject:(Consol Planning) OR subject:(Pickup Report) OR filename:xlsx OR filename:csv)
```

ถ้าต้องการจำกัดผู้ส่ง ให้เพิ่มเช่น:

```text
from:chitiput.p@example.com has:attachment (subject:(Consol Planning) OR subject:(Pickup Report) OR filename:xlsx OR filename:csv)
```

## รูปแบบไฟล์ที่รองรับ

- `.xlsx` Consol Planning
- `.xlsx` Pickup Report
- `.csv` SCD / Global Consol

API ปัจจุบันจะอ่านไฟล์แนบแล้วแยกชนิดไฟล์เอง

## การแจ้งเตือน

ระบบจะแจ้ง 2 ที่:

- ใน SCD: สร้าง alert ในระบบเมื่อ import สำเร็จหรือเกิด error
- ใน Gmail: ส่ง summary ไปที่ `SCD_NOTIFY_EMAIL` ถ้ามีงานใหม่, งานเปลี่ยน, หรือ error

## ตรวจสอบสถานะ

เปิด URL นี้เพื่อตรวจว่า SCD พร้อมรับ n8n หรือยัง:

```text
https://scd-transport.onrender.com/api/integrations/status
```

ต้องเห็น:

```json
{
  "n8n": {
    "configured": true,
    "webhookPath": "/api/integrations/n8n-email"
  }
}
```

ถ้า `configured` เป็น `false` แปลว่ายังไม่ได้ตั้ง `N8N_WEBHOOK_KEY`

## หมายเหตุ

- ถ้าไฟล์เดิมถูกส่งซ้ำ ระบบจะข้ามอัตโนมัติด้วย hash
- ถ้าไฟล์ชื่อเดิมแต่เนื้อหาเปลี่ยน ระบบจะถือเป็นไฟล์ใหม่และ import
- ระบบรองรับการแจ้งว่า `งานใหม่` และ `ข้อมูลเปลี่ยนแปลง` จากผล import ของ backend
- ถ้าต้องการส่ง LINE เพิ่ม สามารถต่อ node HTTP Request หลัง `Build Notification` ไปยัง LINE Messaging API หรือ LINE Notify webhook ได้
