# รายงานทดสอบระบบ End-to-End

วันที่ทดสอบ: 28 สิงหาคม 2026  
ระบบ: S.C.D. Transport Tracking (Render + Supabase)  
House Number สำหรับทดสอบ: `4840794742`  
วัตถุประสงค์: ทดสอบกระบวนการตั้งแต่รับงาน Pickup จนถึงวางบิล โดยไม่ส่งอีเมลออกภายนอก

## ขอบเขตการทดสอบ

- ใช้ข้อมูล House จริง `4840794742` ตามที่ได้รับอนุญาต
- บันทึก status และหลักฐานผ่าน production API ทุกขั้นตอน
- ใช้รูปหลักฐานทดสอบขนาดเล็กแทนรูปหน้างานจริง
- สร้าง invoice ทดสอบ แต่ไม่เรียกขั้นตอนส่งอีเมล

## ผลการทดสอบ

| ลำดับ | ขั้นตอน | ผลลัพธ์ | สถานะหลังทำรายการ |
|---:|---|---|---|
| 1 | Pickup check-in | ผ่าน | `PickupStarted` |
| 2 | โหลดสินค้าขึ้นรถ | ผ่าน | `CargoLoaded` |
| 3 | จบ Pickup พร้อมรูปหลักฐาน | ผ่าน | `Delivered` |
| 4 | ตรวจเอกสารรับเข้า | ผ่าน | `DocumentChecked` |
| 5 | เปิดงานรับเข้า | ผ่าน | `InboundOpened` |
| 6 | สแกน House | ผ่าน | `HouseIdentified` |
| 7 | Putaway / Twin scan ที่ `A-02` | ผ่าน | `Stored` |
| 8 | ปิดงานรับเข้า | ผ่าน | `Stored` |
| 9 | ตรวจเอกสาร Terminal และ WH3 dispatch | ผ่าน | `Stored` |
| 10 | ยืนยัน Location และเบิกสินค้า | ผ่าน | `OutboundPicking` |
| 11 | EI approve | ผ่าน | `EIApproved` |
| 12 | AOT booking และ approve | ผ่าน | `AOTQueueApproved` |
| 13 | โหลดรถ / ถึง Terminal | ผ่าน | `TerminalArrived` |
| 14 | เริ่มชั่ง, บันทึกน้ำหนัก/ขนาด, X-Ray | ผ่าน | `XRayPassed` |
| 15 | Loading detail | ผ่าน | `ReadyForBilling` |
| 16 | Review / สร้าง invoice / mark billed | ผ่านในการทดสอบ | `Billed` |

## สถานะสุดท้าย

- House Number: `4840794742`
- สถานะ: `Billed`
- Invoice ทดสอบ: `INV-2026-0001`
- `readyForBilling`: `false`
- ไม่มีการส่ง email invoice ออกภายนอก

## ปัญหาที่พบ

### 1. Inbound หา Location ไม่เจอ

อาการ: หน้า Inbound แจ้งว่าไม่พบ Location แม้ slot เช่น `A-01` มีในแผนที่คลังจริง

สาเหตุ: API อ่านโครงสร้างแผนที่เก่า (`warehouseMap.locations`) ขณะที่แผนที่จากหน้า Admin เก็บ slot ไว้ที่ `warehouseMaps[].zones[].slots`

ผลกระทบ: ปุ่ม Scan, Putaway, Move Location และ Close Inbound อาจทำงานไม่ต่อเนื่องหรือแสดง error

การแก้ไข: ปรับ API ให้รองรับ Location จากทั้งโครงสร้างเก่าและ slot ของแผนที่คลังปัจจุบันแล้ว

### 2. Billing review รายการเดี่ยว bypass เอกสารบังคับ

อาการ: `review-batch` ปฏิเสธรายการที่ไม่มี Plan/CS approval และ CS evidence แต่ `billing/review` สำหรับรายการเดี่ยวสามารถอนุมัติและออก invoice ต่อได้

ผลกระทบ: มีความเสี่ยงออกใบวางบิลสำหรับงานที่ยังไม่มีหลักฐานอนุมัติครบ

การแก้ไข: เพิ่ม validation ใน `billing/review` ให้คืน `422` และหยุดการอนุมัติทันทีหากเอกสารยังไม่พร้อม

### 3. Mobile ขึ้น `Failed to fetch`

อาการ: ในหน้า Mobile โดยเฉพาะปุ่มปิดงาน ระบบบางครั้งแจ้ง `Failed to fetch`

สาเหตุที่เป็นไปได้: การเชื่อมต่อมือถือหลุดหรือ Render restart หลัง server บันทึกข้อมูลแล้ว แต่ response ไปไม่ถึงโทรศัพท์

การแก้ไข: Mobile ตรวจ status ล่าสุดหลังเกิด network error สำหรับการจบ Pickup และปิดงาน Inbound หาก status ถูกบันทึกสำเร็จ จะถือว่ารายการสำเร็จและไม่ให้ผู้ใช้ส่งซ้ำ

## ข้อสังเกต

- Full-loop API test ผ่านทุก operational step โดยไม่มี `Failed to fetch`
- การทดสอบครั้งแรกพบว่า `A-01` ถูกใช้งานโดย House `4840795134`; เปลี่ยนมาทดสอบที่ `A-02` ซึ่งว่าง
- ทุกการบันทึกใน flow รอให้ Supabase ยืนยันก่อนตอบกลับ เพื่อลดความเสี่ยงข้อมูลหายเมื่อ Render restart

## รายการแก้ไขที่ส่งขึ้น GitHub

- `fa5047d` — ใช้ slot จากแผนที่คลังปัจจุบันใน Inbound flow
- `7277d80` — บล็อก single billing review เมื่อเอกสารไม่ครบ
- `29a106c` — ตรวจผลหลัง Mobile connection drop เพื่อลดการส่งงานซ้ำ
- `5379d14` — ปิดฟอร์ม Pickup หลังจบงานสำเร็จ
- `120c37d` — แจ้งข้อกำหนดก่อนจบ Pickup ให้ชัดเจน

## ข้อเสนอแนะถัดไป

1. เพิ่มหน้า test/sandbox ที่ใช้ข้อมูลจำลอง เพื่อไม่ต้องสร้าง invoice ทดสอบใน production
2. แยกไฟล์รูปออกจาก JSON state ไปยัง Supabase Storage เพื่อลดขนาดการบันทึกต่อครั้ง
3. เพิ่ม automated end-to-end test สำหรับ Pickup → Inbound → Outbound → Billing ใน CI
