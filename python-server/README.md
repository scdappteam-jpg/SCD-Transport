# SCD Image Processor

FastAPI service สำหรับประมวลผลภาพ Barcode และ QR Code เท่านั้น

## Run

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

Service ทำงานที่ `http://localhost:5000` และตรวจสถานะได้ที่ `/health`

Next.js จะส่งภาพผ่าน `POST /api/scan-barcode` มายัง `POST /scan` ของ service นี้
