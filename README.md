# S.C.D. Transport

ระบบติดตามและจัดการงานขนส่ง แยกการทำงานออกเป็นสองบริการ

- `nextjs-app` เป็นหน้าเว็บ, Backend API, การจัดการข้อมูล และ proxy ไปยัง Python
- `python-server` ประมวลผลภาพ Barcode และ QR Code แล้วส่งผลกลับเท่านั้น

## ความต้องการของระบบ

- Node.js `20.9.0` ขึ้นไป
- Corepack และ pnpm `11.21.0`
- Python พร้อม `pip` และ `venv`

## ติดตั้ง Python Server

เปิด PowerShell ที่ root ของ repository แล้วรัน:

```powershell
cd python-server
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

เริ่ม Python Server:

```powershell
cd python-server
.venv\Scripts\python.exe app.py
```

บริการที่เปิดใช้งาน:

- API: `http://localhost:5000`
- Health check: `http://localhost:5000/health`
- Swagger UI: `http://localhost:5000/docs`
- Scan endpoint: `POST http://localhost:5000/scan`

พอร์ตเริ่มต้นคือ `5000` และเปลี่ยนได้ด้วย environment variable `SCAN_PORT`

## ติดตั้ง Next.js

เปิด PowerShell อีกหน้าต่างที่ root ของ repository แล้วรัน:

```powershell
cd nextjs-app
corepack enable
pnpm install --frozen-lockfile
```

เริ่ม Development Server:

```powershell
cd nextjs-app
pnpm dev
```

หน้าเว็บที่เปิดใช้งาน:

- Dashboard: `http://localhost:3000`
- Field scanner: `http://localhost:3000/field`
- Legacy compatibility UI: `http://localhost:3000/legacy/index.html`
- Next.js API health: `http://localhost:3000/api/health`

Next.js ส่งภาพจาก `POST /api/scan-barcode` ไปยัง Python Server ตามค่า `SCAN_SERVICE_URL` ซึ่งมีค่าเริ่มต้นเป็น `http://localhost:5000/scan`

## รันทั้งสองบริการพร้อมกัน

หลังจากติดตั้ง dependencies ของทั้งสองส่วนแล้ว สามารถเปิดไฟล์นี้ได้โดยตรง:

```text
Start-SmartLogistics.cmd
```

สคริปต์จะเปิด Python Server และ Next.js Development Server ให้โดยอัตโนมัติ

## รันแบบ Production

หยุด Development Server ก่อน แล้วรัน:

```powershell
cd nextjs-app
pnpm build
pnpm start
```

ไม่ควรรัน `pnpm build` ขณะที่ `pnpm dev` กำลังทำงาน เพราะทั้งสองคำสั่งใช้โฟลเดอร์ `.next` ร่วมกัน

## ตรวจสอบโค้ดก่อนส่งงาน

```powershell
cd nextjs-app
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Environment Variables

ตัวอย่างค่า configuration อยู่ที่ `nextjs-app/.env.example`

ค่าหลักที่ใช้ในการรันในเครื่อง:

```dotenv
PORT=3000
HOST=0.0.0.0
SCAN_SERVICE_URL=http://localhost:5000/scan
DATA_DIR=
STORAGE_DIR=
```

สำหรับข้อมูลที่ต้องเก็บถาวร ควรกำหนด `DATA_DIR` และ `STORAGE_DIR` เป็น absolute path ให้ชัดเจนใน environment ของเครื่องที่รันระบบ

## โครงสร้างหลัก

```text
SCD-Transport/
├── nextjs-app/
│   ├── src/app/
│   ├── src/components/
│   ├── src/services/
│   ├── src/server/
│   ├── src/types/
│   └── public/legacy/
├── python-server/
│   ├── app.py
│   └── services/scanner_service.py
├── AGENTS.md
└── Start-SmartLogistics.cmd
```

รายละเอียดขอบเขตของแต่ละบริการและข้อกำหนดสำหรับทีมพัฒนาต่ออยู่ใน `AGENTS.md` ของ root และแต่ละ application
