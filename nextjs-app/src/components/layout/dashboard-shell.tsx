"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Boxes, Building2, FilePlus2, HelpCircle, LayoutDashboard, Menu, RefreshCw, Search, Smartphone, Truck, Users, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { getBootstrap } from "@/services/api.service";
import { JobsPanel } from "@/components/dashboard/jobs-panel";
import { OverviewPanel } from "@/components/dashboard/overview-panel";
import { TeamPanel } from "@/components/dashboard/team-panel";

const sections = [
  { id: "overview", label: "ภาพรวม", icon: LayoutDashboard },
  { id: "jobs", label: "ติดตามงาน", icon: Truck },
  { id: "team", label: "ทีมปฏิบัติการ", icon: Users }
] as const;

const queueSteps = [
  { label: "Summary", helper: "ภาพรวมคิว", section: "overview" },
  { label: "Queue Booking", helper: "เปิด/จัดการใบงาน", section: "jobs" },
  { label: "Tracking", helper: "ติดตามสถานะ", section: "jobs" },
  { label: "Online Help", helper: "คู่มือใช้งาน", href: "/field" }
] as const;

type SectionId = typeof sections[number]["id"];

export function DashboardShell() {
  const [section, setSection] = useState<SectionId>("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const query = useQuery({ queryKey: ["bootstrap"], queryFn: getBootstrap, refetchInterval: 60000 });

  const selectSection = (id: SectionId) => {
    setSection(id);
    setMenuOpen(false);
  };

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      {menuOpen && <button aria-label="ปิดเมนู" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-sm lg:hidden" />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col bg-[#102947] text-white transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-20 items-center gap-3 border-b border-white/10 px-5">
          <span className="grid size-11 place-items-center rounded-xl bg-blue-500 shadow-lg shadow-blue-950/40"><Building2 className="size-6" /></span>
          <div><strong className="block text-sm tracking-wide">S.C.D. TRANSPORT</strong><span className="text-[10px] uppercase tracking-[0.2em] text-blue-200">Operations Center</span></div>
          <button onClick={() => setMenuOpen(false)} className="ml-auto inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-black hover:bg-white/10 lg:hidden"><X className="size-5" />ปิด</button>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          <p className="px-3 pb-2 pt-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Workspace</p>
          {sections.map(item => <button key={item.id} onClick={() => selectSection(item.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold transition ${section === item.id ? "bg-blue-500 text-white shadow-lg shadow-blue-950/30" : "text-slate-300 hover:bg-white/8 hover:text-white"}`}><item.icon className="size-4" />{item.label}</button>)}
          <p className="px-3 pb-2 pt-6 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Operations</p>
          <Link href="/field" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold text-slate-300 hover:bg-white/8 hover:text-white"><Smartphone className="size-4" />หน้างานมือถือ</Link>
          <Link href="/dashboard" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold text-slate-300 hover:bg-white/8 hover:text-white"><Boxes className="size-4" />ระบบปฏิบัติการเต็มรูปแบบ</Link>
        </nav>
        <div className="m-4 rounded-xl bg-white/7 p-4 ring-1 ring-white/10"><div className="flex items-center gap-2 text-xs font-bold text-emerald-300"><span className="size-2 rounded-full bg-emerald-400" />Next.js API Online</div><p className="mt-2 text-[11px] leading-5 text-slate-400">ข้อมูลหลักและ Python image processor เชื่อมผ่าน proxy กลาง</p></div>
      </aside>

      <main className="min-w-0">
        <header className="sticky top-0 z-20 flex min-h-20 flex-wrap items-center gap-3 border-b border-slate-200/80 bg-white/92 px-4 py-3 backdrop-blur-xl sm:px-6 xl:px-8">
          <button onClick={() => setMenuOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-black text-slate-700 lg:hidden"><Menu className="size-5" />เมนู</button>
          <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-700">SCD control tower</p><h1 className="text-lg font-black tracking-tight sm:text-xl">{sections.find(item => item.id === section)?.label}</h1></div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <span className="hidden rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 sm:inline-flex">Live data</span>
            <button onClick={() => query.refetch()} disabled={query.isFetching} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`size-4 ${query.isFetching ? "animate-spin" : ""}`} />รีเฟรช</button>
          </div>
        </header>

        <section className="border-b border-slate-200 bg-slate-50/80 px-4 py-3 sm:px-6 xl:px-8">
          <div className="grid gap-3 xl:grid-cols-[1fr_auto]">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {queueSteps.map(item => {
                const isActive = "section" in item && item.section === section;
                const body = <><span className="block text-sm font-black">{item.label}</span><span className={`block text-xs font-semibold ${isActive ? "text-blue-100" : "text-slate-500"}`}>{item.helper}</span></>;
                return "href" in item ? (
                  <Link key={item.label} href={item.href} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-blue-300 hover:bg-blue-50">{body}</Link>
                ) : (
                  <button key={item.label} onClick={() => selectSection(item.section)} className={`rounded-xl border px-4 py-3 text-left shadow-sm transition ${isActive ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-900 hover:border-blue-300 hover:bg-blue-50"}`}>
                    {body}
                  </button>
                );
              })}
            </div>
            <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[440px]">
              <button onClick={() => selectSection("jobs")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-blue-800"><Search className="size-4" />ค้นหาใบงาน</button>
              <Link href="/dashboard" className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-black text-blue-700 shadow-sm hover:bg-blue-50"><FilePlus2 className="size-4" />เปิดใบงาน</Link>
              <Link href="/field" className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"><HelpCircle className="size-4" />คู่มือหน้างาน</Link>
            </div>
          </div>
        </section>

        <div className="p-4 sm:p-6 xl:p-8">
          {query.isLoading && <div className="grid min-h-[55vh] place-items-center"><div className="text-center"><span className="mx-auto block size-9 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" /><p className="mt-4 text-sm font-semibold text-slate-500">กำลังโหลดข้อมูลปฏิบัติการ</p></div></div>}
          {query.isError && <div className="mx-auto mt-20 max-w-lg rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm"><AlertCircle className="mx-auto size-10 text-rose-500" /><h2 className="mt-4 text-lg font-black">เชื่อมต่อข้อมูลไม่สำเร็จ</h2><p className="mt-2 text-sm text-slate-500">ตรวจสอบบริการ Next.js แล้วลองใหม่อีกครั้ง</p><button onClick={() => query.refetch()} className="mt-5 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-bold text-white">ลองอีกครั้ง</button></div>}
          {query.data && section === "overview" && <OverviewPanel data={query.data} />}
          {query.data && section === "jobs" && <JobsPanel jobs={query.data.dashboard.jobs} />}
          {query.data && section === "team" && <TeamPanel data={query.data} />}
        </div>
      </main>
    </div>
  );
}
