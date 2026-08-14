import re

import cv2

try:
    import easyocr
except Exception:  # easyocr is optional (heavy); barcode scanning works without it
    easyocr = None

from pyzbar.pyzbar import decode

reader = None


def get_reader():
    global reader
    if reader is None:
        if easyocr is None:
            raise RuntimeError("easyocr not installed (lite mode)")
        reader = easyocr.Reader(["en"], gpu=False)
    return reader


class ScannerService:
    @staticmethod
    def normalize(text: str) -> str:
        return re.sub(r"[^A-Za-z0-9]", "", text)

    @staticmethod
    def scan_barcodes_from_path(filepath: str) -> list[str]:
        results = set()
        image = cv2.imread(filepath)
        if image is None:
            return []

        rotations = (
            image,
            cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE),
            cv2.rotate(image, cv2.ROTATE_180),
            cv2.rotate(image, cv2.ROTATE_90_COUNTERCLOCKWISE),
        )

        for rotated in rotations:
            gray = cv2.cvtColor(rotated, cv2.COLOR_BGR2GRAY)
            gray = cv2.resize(gray, None, fx=2, fy=2)
            gray = cv2.GaussianBlur(gray, (3, 3), 0)
            gray = cv2.threshold(gray, 140, 255, cv2.THRESH_BINARY)[1]

            for barcode in decode(gray):
                value = barcode.data.decode("utf-8").strip()
                x, y, width, height = barcode.rect
                crop = rotated[
                    max(0, y + height):min(rotated.shape[0] - 1, y + height + 120),
                    max(0, x - 30):min(rotated.shape[1] - 1, x + width + 30),
                ]
                ocr_text = ""

                if crop is not None and crop.size > 0:
                    try:
                        ocr_text = "".join(get_reader().readtext(crop, detail=0))
                    except Exception:
                        pass

                clean_ocr = ScannerService.normalize(ocr_text)
                clean_barcode = ScannerService.normalize(value)
                final_value = clean_barcode

                if clean_ocr:
                    if clean_ocr in clean_barcode:
                        final_value = clean_ocr
                    else:
                        for digits in re.findall(r"\d+", clean_ocr):
                            if digits in clean_barcode:
                                final_value = digits
                                break

                if final_value:
                    results.add(final_value)

        return sorted(results)
