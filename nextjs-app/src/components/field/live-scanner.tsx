"use client";

import { LoaderCircle, ScanLine, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const CDN_SRC = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";

type Html5QrcodeInstance = {
  start: (
    camera: { facingMode: string },
    config: { fps: number; qrbox: { width: number; height: number } },
    onSuccess: (decodedText: string) => void,
    onError: (message: string) => void
  ) => Promise<void>;
  stop: () => Promise<void>;
  clear: () => void;
};

type Html5QrcodeConstructor = new (elementId: string) => Html5QrcodeInstance;

declare global {
  interface Window {
    Html5Qrcode?: Html5QrcodeConstructor;
  }
}

function loadScannerLibrary(): Promise<Html5QrcodeConstructor> {
  return new Promise((resolve, reject) => {
    if (window.Html5Qrcode) {
      resolve(window.Html5Qrcode);
      return;
    }
    const fail = () => reject(new Error("โหลดตัวสแกนไม่สำเร็จ (ต้องต่ออินเทอร์เน็ตครั้งแรก)"));
    const done = () => (window.Html5Qrcode ? resolve(window.Html5Qrcode) : fail());
    const existing = document.querySelector(`script[src="${CDN_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", done);
      existing.addEventListener("error", fail);
      return;
    }
    const script = document.createElement("script");
    script.src = CDN_SRC;
    script.async = true;
    script.onload = done;
    script.onerror = fail;
    document.head.appendChild(script);
  });
}

function playBeep() {
  try {
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.frequency.value = 1400;
    gain.gain.value = 0.2;
    oscillator.start();
    oscillator.stop(context.currentTime + 0.12);
  } catch {
    // เสียงเป็นของเสริม ถ้าเล่นไม่ได้ให้ข้าม
  }
}

export function LiveScanner({ onDetected }: { onDetected: (code: string) => void }) {
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const scannerRef = useRef<Html5QrcodeInstance | null>(null);
  const detectionLockRef = useRef(false);

  const stop = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    setActive(false);
    if (scanner) {
      try {
        await scanner.stop();
        scanner.clear();
      } catch {
        // ปิดกล้องซ้ำได้อย่างปลอดภัย
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);

  const start = async () => {
    setError(null);
    setLastCode(null);
    setStarting(true);
    await new Promise(resolve => setTimeout(resolve, 80));
    try {
      const Html5Qrcode = await loadScannerLibrary();
      const scanner = new Html5Qrcode("live-scanner-view");
      scannerRef.current = scanner;
      detectionLockRef.current = false;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 270, height: 170 } },
        decodedText => {
          if (detectionLockRef.current) return;
          detectionLockRef.current = true;
          const code = decodedText.trim();
          setLastCode(code);
          playBeep();
          if (typeof navigator.vibrate === "function") navigator.vibrate(150);
          onDetected(code);
          void stop();
        },
        () => {
          // เฟรมที่ยังหาไม่เจอ — ไม่ต้องทำอะไร
        }
      );
      setActive(true);
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : "เปิดกล้องไม่สำเร็จ — ตรวจสอบว่าอนุญาตให้ใช้กล้องแล้ว"
      );
      await stop();
    } finally {
      setStarting(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 bg-emerald-700 px-5 py-4 text-white">
        <div className="flex items-center gap-2">
          <ScanLine className="size-5" />
          <div>
            <h2 className="font-black leading-tight">สแกนสดด้วยกล้อง</h2>
            <p className="text-[11px] text-emerald-100">เล็งบาร์โค้ด อ่านทันทีเหมือนเครื่องยิง</p>
          </div>
        </div>
        {active && (
          <button
            onClick={() => void stop()}
            aria-label="ปิดกล้อง"
            className="grid size-9 place-items-center rounded-xl bg-white/15 transition hover:bg-white/25"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className="p-4">
        <div
          id="live-scanner-view"
          className={`overflow-hidden rounded-2xl bg-slate-950 [&_video]:!w-full [&_video]:!rounded-2xl ${active || starting ? "min-h-64" : "hidden"}`}
        />

        {!active && (
          <button
            onClick={() => void start()}
            disabled={starting}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-emerald-900/20 transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60"
          >
            {starting ? <LoaderCircle className="size-5 animate-spin" /> : <ScanLine className="size-5" />}
            {starting ? "กำลังเปิดกล้อง..." : "เริ่มสแกนสด"}
          </button>
        )}

        {active && (
          <p className="mt-3 text-center text-xs font-semibold text-slate-500">
            เล็งให้บาร์โค้ดอยู่ในกรอบ ระบบจะอ่านและหยุดให้อัตโนมัติ
          </p>
        )}

        {lastCode && (
          <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-center text-sm font-black text-emerald-800 ring-1 ring-emerald-200">
            ✓ อ่านได้: {lastCode}
          </p>
        )}

        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-800">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
