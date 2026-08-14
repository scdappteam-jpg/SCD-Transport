"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Camera, CheckCircle2, FileImage, FlaskConical, LoaderCircle, PackageSearch, RotateCcw, Upload, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { LiveScanner } from "@/components/field/live-scanner";
import { StatusBadge } from "@/components/ui/status-badge";
import { getBootstrap, scanBarcode, toScanDisplayResult } from "@/services/api.service";

export function FieldOperations() {
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [selectedImage, setSelectedImage] = useState<{ file: File; url: string } | null>(null);
  const [scanResult, setScanResult] = useState<ScanDisplayResult | null>(null);
  const [manualHouse, setManualHouse] = useState("");
  const query = useQuery({ queryKey: ["bootstrap"], queryFn: getBootstrap });
  const scan = useMutation({
    mutationFn: scanBarcode,
    onMutate: () => setScanResult(null),
    onSuccess: response => setScanResult(toScanDisplayResult(response))
  });
  const selectedHouse = manualHouse.trim() || scanResult?.codes[0] || "";
  const selectedJob = useMemo(() => {
    const normalize = (value: string) => value.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const target = normalize(selectedHouse);
    if (!target) return undefined;
    return query.data?.dashboard.jobs.find(job => normalize(job.houseNumber) === target);
  }, [query.data, selectedHouse]);

  useEffect(() => {
    const previewUrl = selectedImage?.url;
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [selectedImage?.url]);

  const selectImage = (file?: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    setSelectedImage({ file, url: URL.createObjectURL(file) });
    setScanResult(null);
    setManualHouse("");
    scan.reset();
  };

  const clearImage = () => {
    setSelectedImage(null);
    setScanResult(null);
    setManualHouse("");
    scan.reset();
    if (uploadInputRef.current) uploadInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  return (
    <main className="min-h-screen bg-slate-100 pb-10">
      <header className="sticky top-0 z-20 bg-[#102947] px-4 py-4 text-white shadow-lg">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Link href="/" aria-label="กลับหน้าหลัก" className="grid size-10 place-items-center rounded-xl bg-white/10 transition hover:bg-white/20">
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-200">Field operations</p>
            <h1 className="font-black">ทดสอบระบบสแกนภาพ</h1>
          </div>
          <span className="ml-auto size-2 rounded-full bg-emerald-400" />
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <LiveScanner
          onDetected={code => {
            setManualHouse(code);
            setScanResult(null);
            scan.reset();
          }}
        />

        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-blue-700 to-blue-950 p-6 text-white shadow-xl shadow-blue-950/20">
          <FileImage className="size-8 text-blue-200" />
          <h2 className="mt-5 text-2xl font-black">เลือกภาพ Barcode หรือ QR Code</h2>
          <p className="mt-2 text-sm leading-6 text-blue-100">เลือกภาพจากเครื่องหรือถ่ายด้วยกล้อง จากนั้นกดทดสอบเพื่อส่งผ่าน Next.js proxy ไปยัง Python server</p>
          <input
            id="upload-scan-image"
            ref={uploadInputRef}
            type="file"
            accept="image/*"
            onChange={event => selectImage(event.target.files?.[0])}
            className="hidden"
          />
          <input
            id="capture-scan-image"
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={event => selectImage(event.target.files?.[0])}
            className="hidden"
          />
          <div className="mt-6 grid grid-cols-2 gap-3">
            <label htmlFor="upload-scan-image" role="button" tabIndex={scan.isPending ? -1 : 0} aria-disabled={scan.isPending} className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3.5 text-sm font-black text-blue-900 shadow-lg transition hover:bg-blue-50 ${scan.isPending ? "pointer-events-none opacity-60" : ""}`}>
              <Upload className="size-5" />เลือกไฟล์
            </label>
            <label htmlFor="capture-scan-image" role="button" tabIndex={scan.isPending ? -1 : 0} aria-disabled={scan.isPending} className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3.5 text-sm font-black text-white ring-1 ring-white/25 transition hover:bg-white/15 ${scan.isPending ? "pointer-events-none opacity-60" : ""}`}>
              <Camera className="size-5" />เปิดกล้อง
            </label>
          </div>
        </section>

        {selectedImage && (
          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Image preview</p>
                <h2 className="mt-1 truncate font-black text-slate-900">{selectedImage.file.name}</h2>
                <p className="mt-1 text-xs text-slate-500">{selectedImage.file.type} · {(selectedImage.file.size / 1024).toFixed(1)} KB</p>
              </div>
              <button onClick={clearImage} disabled={scan.isPending} aria-label="ลบภาพที่เลือก" className="grid size-9 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-50">
                <X className="size-4" />
              </button>
            </div>

            <div className="relative mt-4 h-64 w-full overflow-hidden rounded-2xl bg-slate-950 ring-1 ring-slate-200 sm:h-80">
              <Image src={selectedImage.url} alt={`ภาพสำหรับทดสอบ ${selectedImage.file.name}`} fill unoptimized sizes="(max-width: 640px) 100vw, 640px" className="object-contain p-2" />
            </div>

            <button onClick={() => scan.mutate(selectedImage.file)} disabled={scan.isPending} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 px-5 py-4 text-sm font-black text-white shadow-lg shadow-blue-900/20 transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60">
              {scan.isPending ? <LoaderCircle className="size-5 animate-spin" /> : <FlaskConical className="size-5" />}
              {scan.isPending ? "กำลังส่งภาพไป Python server" : "ทดสอบสแกนภาพนี้"}
            </button>
          </section>
        )}

        {scan.isError && (
          <section role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <strong className="block font-black">ทดสอบไม่สำเร็จ</strong>
            <span className="mt-1 block break-words">{scan.error instanceof Error ? scan.error.message : "ไม่สามารถเชื่อมต่อ Python server ได้"}</span>
          </section>
        )}

        {scanResult && (
          <section className={`rounded-3xl border bg-white p-5 shadow-sm ${scanResult.count ? "border-emerald-200" : "border-amber-200"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className={`flex items-center gap-2 font-black ${scanResult.count ? "text-emerald-700" : "text-amber-700"}`}>
                <CheckCircle2 className="size-5" />Python response
              </div>
              <div className="flex gap-2 text-xs font-bold">
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">success: {String(scanResult.success)}</span>
                <span className="rounded-full bg-blue-50 px-3 py-1.5 text-blue-700">count: {scanResult.count}</span>
              </div>
            </div>

            {scanResult.codes.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {scanResult.codes.map(code => (
                  <button key={code} onClick={() => setManualHouse(code)} className="max-w-full break-all rounded-xl bg-emerald-50 px-3 py-2 text-left text-sm font-black text-emerald-800 ring-1 ring-emerald-200 transition hover:bg-emerald-100">
                    {code}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">Python ประมวลผลสำเร็จ แต่ไม่พบ Barcode หรือ QR Code ในภาพนี้</p>
            )}

            <details className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-950 text-slate-100">
              <summary className="cursor-pointer px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-300">ดูข้อมูลดิบที่ได้รับ</summary>
              <pre className="max-h-72 overflow-auto border-t border-white/10 p-4 text-xs leading-5 text-emerald-300">{scanResult.rawJson}</pre>
            </details>
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <label htmlFor="manual-house" className="text-xs font-bold uppercase tracking-wider text-slate-500">หรือกรอก House Number</label>
          <div className="mt-2 flex gap-2">
            <input id="manual-house" value={manualHouse} onChange={event => setManualHouse(event.target.value)} placeholder="เช่น H-1001" className="h-12 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 font-bold uppercase" />
            <button onClick={() => setManualHouse("")} aria-label="ล้าง House Number" className="grid size-12 place-items-center rounded-xl border border-slate-200 transition hover:bg-slate-50">
              <RotateCcw className="size-4" />
            </button>
          </div>
        </section>

        {selectedHouse && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            {selectedJob ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-xs font-bold uppercase tracking-widest text-blue-700">Shipment found</p><h2 className="mt-1 text-2xl font-black">{selectedJob.houseNumber}</h2></div>
                  <StatusBadge status={selectedJob.status} />
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">ลูกค้า</dt><dd className="mt-1 font-bold">{selectedJob.customerName || "-"}</dd></div>
                  <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">Flight</dt><dd className="mt-1 font-bold">{selectedJob.flightNo || "-"}</dd></div>
                  <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">ตำแหน่ง</dt><dd className="mt-1 font-bold">{selectedJob.locationId || "ยังไม่จัดเก็บ"}</dd></div>
                  <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">ปลายทาง</dt><dd className="mt-1 font-bold">{selectedJob.destination || selectedJob.routeType || "-"}</dd></div>
                </dl>
                <Link href={`/legacy/mobile.html?house=${encodeURIComponent(selectedJob.houseNumber)}`} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-black text-white">
                  <PackageSearch className="size-4" />เปิดขั้นตอนปฏิบัติงาน
                </Link>
              </>
            ) : (
              <div className="py-4 text-center">
                <PackageSearch className="mx-auto size-8 text-slate-300" />
                <h2 className="mt-3 font-black">ไม่พบ House {selectedHouse}</h2>
                <p className="mt-1 text-sm text-slate-500">ตรวจสอบรหัสแล้วลองอีกครั้ง</p>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
