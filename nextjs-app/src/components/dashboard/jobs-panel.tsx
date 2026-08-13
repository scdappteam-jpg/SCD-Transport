"use client";

import { Search } from "lucide-react";
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
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-col gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-widest text-blue-700">Shipment control</p><h2 className="mt-1 text-xl font-black">ติดตามงานขนส่ง</h2></div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex min-w-64 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3"><Search className="size-4 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="ค้นหา House, ลูกค้า, Flight" className="h-10 w-full bg-transparent text-sm" /></label>
          <select value={status} onChange={event => setStatus(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold">{statuses.map(item => <option key={item}>{item}</option>)}</select>
        </div>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">House</th><th className="px-5 py-3">ลูกค้า</th><th className="px-5 py-3">Flight</th><th className="px-5 py-3">สถานะ</th><th className="px-5 py-3">ตำแหน่ง</th><th className="px-5 py-3">อัปเดตล่าสุด</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{filteredJobs.slice(0, 100).map(job => <tr key={job.id || job.houseNumber} className="hover:bg-blue-50/40"><td className="px-5 py-4 font-black text-slate-900">{job.houseNumber}</td><td className="px-5 py-4 text-slate-600">{job.customerName || "-"}</td><td className="px-5 py-4"><strong>{job.flightNo || "-"}</strong><span className="block text-xs text-slate-400">{job.destination || job.terminalDestination || ""}</span></td><td className="px-5 py-4"><StatusBadge status={job.status} /></td><td className="px-5 py-4 text-slate-600">{job.locationId || "-"}</td><td className="px-5 py-4 text-xs text-slate-500">{formatBangkok(job.updatedAt || job.createdAt)}</td></tr>)}</tbody>
        </table>
      </div>
      <footer className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">แสดง {Math.min(filteredJobs.length, 100)} จาก {filteredJobs.length} รายการ</footer>
    </section>
  );
}
