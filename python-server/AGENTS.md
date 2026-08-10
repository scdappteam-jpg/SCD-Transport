# S.C.D. Transport Image Processor

## Ownership

This FastAPI service accepts uploaded images and returns detected barcode or QR values. Next.js owns every browser page, business API, persisted state, storage path, authentication rule, and external workflow integration.

Do not add web pages, business workflows, persistence, user management, billing, notifications, or application proxy behavior to Python.

## API Contract

- `POST /scan`: accepts a multipart image field named `image` and returns `success`, `count`, and `barcodes`.
- `GET /health`: returns service health information.
- The default port is `5000`, configurable through `SCAN_PORT`.
- Next.js calls this service through `SCAN_SERVICE_URL` from its `/api/scan-barcode` handler.

## Code Structure

- `app.py` owns HTTP validation, temporary upload handling, and response serialization.
- `services/scanner_service.py` owns image preprocessing, barcode decoding, and OCR assistance.
- Keep image processing off the async event loop.
- Do not expose local file paths in API responses.

## Verification

Run the service and verify both endpoints:

```powershell
.venv\Scripts\python.exe app.py
```

Test `POST /scan` with a real image through both port `5000` and the Next.js `/api/scan-barcode` proxy.
