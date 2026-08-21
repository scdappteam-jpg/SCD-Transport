"use client";

import { FilePlus2, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatBangkok } from "@/services/format.service";
import { StatusBadge } from "@/components/ui/status-badge";

export function JobsPanel({ jobs }: { jobs: Job[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const statuses = useMemo(() => ["All", ...Array.from(new Set(jobs.map(job => job.status).filter(Boolean)))], [jobs]);
  const filteredJobs = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return jobs.filter(job => {
      const matchesStatus = status === "All" || job.status === status;
      const target = `${job.houseNumber} ${job.customerName || ""} ${job.flightNo || ""}`.toLowerCase();
      return matchesStatus && (!keyword || target.includes(keyword));
    });
  }, [jobs, search, status]);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 bg-slate-50/70 p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-widest text-blue-700">Queue Booking / Tracking</p><h2 className="mt-1 text-xl font-black">ติดตามงานขนส่ง</h2><p className="mt-1 text-sm text-slate-500">ค้นหา House, ลูกค้า หรือ Flight แล้วดูสถานะล่าสุดได้ทันที</p></div>
          <Link href="/dashboard" className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-blue-800"><FilePlus2 className="size-4" />Create New Booking</Link>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_220px]">
          <label className="grid gap-1 text-xs font-bold text-slate-600">
            Booking No / House / Flight
            <span className="flex min-h-12 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3"><Search className="size-4 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="เช่น H-2001, WD, TG..." className="min-h-0 w-full bg-transparent py-3 text-sm outline-none" /></span>
          </label>
          <label className="grid gap-1 text-xs font-bold text-slate-600">
            Status
            <select value={status} onChange={event => setStatus(event.target.value)} className="min-h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-blue-600">{statuses.map(item => <option key={item}>{item}</option>)}</select>
          </label>
        </div>
      </header>
      <div className="grid gap-3 p-4 md:hidden">
        {filteredJobs.slice(0, 100).map(job => (
          <article key={job.id || job.houseNumber} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-lg font-black text-slate-900">{job.houseNumber}</p>
                <p className="mt-1 text-sm leading-5 text-slate-500">{job.customerName || "ไม่ระบุลูกค้า"}</p>
              </div>
              <StatusBadge status={job.status} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs font-bold text-slate-500">Flight</dt><dd className="mt-1 font-black text-slate-900">{job.flightNo || "-"}</dd></div>
              <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs font-bold text-slate-500">ปลายทาง</dt><dd className="mt-1 font-black text-slate-900">{job.destination || job.terminalDestination || "-"}</dd></div>
              <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs font-bold text-slate-500">ตำแหน่ง</dt><dd className="mt-1 font-black text-slate-900">{job.locationId || "-"}</dd></div>
              <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs font-bold text-slate-500">อัปเดตล่าสุด</dt><dd className="mt-1 text-xs font-bold text-slate-700">{formatBangkok(job.updatedAt || job.createdAt)}</dd></div>
            </dl>
          </article>
        ))}
        {!filteredJobs.length && <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm font-semibold text-slate-500">ไม่พบใบงานตามเงื่อนไขที่ค้นหา</div>}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">House</th><th className="px-5 py-3">ลูกค้า</th><th className="px-5 py-3">Flight</th><th className="px-5 py-3">สถานะ</th><th className="px-5 py-3">ตำแหน่ง</th><th className="px-5 py-3">อัปเดตล่าสุด</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{filteredJobs.slice(0, 100).map(job => <tr key={job.id || job.houseNumber} className="hover:bg-blue-50/40"><td className="px-5 py-4 font-black text-slate-900">{job.houseNumber}</td><td className="px-5 py-4 text-slate-600">{job.customerName || "-"}</td><td className="px-5 py-4"><strong>{job.flightNo || "-"}</strong><span className="block text-xs text-slate-400">{job.destination || job.terminalDestination || ""}</span></td><td className="px-5 py-4"><StatusBadge status={job.status} /></td><td className="px-5 py-4 text-slate-600">{job.locationId || "-"}</td><td className="px-5 py-4 text-xs text-slate-500">{formatBangkok(job.updatedAt || job.createdAt)}</td></tr>)}</tbody>
        </table>
      </div>
      <footer className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">แสดง {Math.min(filteredJobs.length, 100)} จาก {filteredJobs.length} รายการ</footer>
    </section>
  );
}
