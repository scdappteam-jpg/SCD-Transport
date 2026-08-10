import asyncio
import os
import tempfile

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from services.scanner_service import ScannerService

app = FastAPI(title="SCD Image Processor")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PORT = int(os.getenv("SCAN_PORT", "5000"))
MAX_IMAGE_BYTES = int(os.getenv("MAX_IMAGE_BYTES", str(15 * 1024 * 1024)))


@app.get("/health")
async def health():
    return {"status": "ok", "service": "image-processor"}


@app.post("/scan")
async def scan_barcodes(image: UploadFile = File(...)):
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    content = await image.read(MAX_IMAGE_BYTES + 1)
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image is too large")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as temporary_file:
        temporary_file.write(content)
        temporary_path = temporary_file.name

    try:
        barcodes = await asyncio.to_thread(ScannerService.scan_barcodes_from_path, temporary_path)
        return {"success": True, "count": len(barcodes), "barcodes": barcodes}
    finally:
        os.unlink(temporary_path)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=PORT)
