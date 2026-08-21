import { AlertTriangle, CircleDollarSign, Clock3, PackageCheck } from "lucide-react";
import Link from "next/link";
import { formatMoney } from "@/services/format.service";
import { MetricCard } from "./metric-card";

export function OverviewPanel({ data }: { data: BootstrapResponse }) {
  const { metrics, jobs, alerts } = data.dashboard;
  const activeAlerts = alerts.filter(item => !item.dismissed).slice(0, 5);
  const terminals = metrics.terminalSummary || [];
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-blue-700">Summary</p>
            <h2 className="mt-1 text-xl font-black">ภาพรวมคิวปฏิบัติการ</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">รูปแบบเดียวกับ Smart Queue: ดูจำนวนงาน, สถานะ, รายการต้องทำ และไปหน้าติดตามได้ทันที</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[520px]">
            <Link href="/dashboard" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-center text-sm font-black text-blue-700 hover:bg-blue-100">Queue Booking</Link>
            <Link href="/field" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-black text-slate-700 hover:bg-slate-50">Mobile Field</Link>
            <Link href="/dashboard" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-black text-slate-700 hover:bg-slate-50">Tracking</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="งานที่กำลังดำเนินการ" value={metrics.openJobs} detail={`จากทั้งหมด ${jobs.length} House`} icon={PackageCheck} tone="bg-blue-50 text-blue-700" />
        <MetricCard label="พร้อมวางบิล" value={metrics.readyForBilling} detail={formatMoney(metrics.pendingAmount)} icon={CircleDollarSign} tone="bg-emerald-50 text-emerald-700" />
        <MetricCard label="มูลค่าวางบิลแล้ว" value={formatMoney(metrics.billedAmount)} detail="ยอดสะสมในระบบ" icon={Clock3} tone="bg-violet-50 text-violet-700" />
        <MetricCard label="เวลาปฏิบัติงานเฉลี่ย" value={`${metrics.averageDurationMinutes || 0} นาที`} detail="จาก activity ที่เสร็จสมบูรณ์" icon={AlertTriangle} tone="bg-amber-50 text-amber-700" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-xs font-bold uppercase tracking-widest text-blue-700">Terminal flow</p><h2 className="mt-1 text-lg font-black">ภาพรวมปลายทาง</h2><p className="mt-1 text-sm text-slate-500">แยกตามจุดงาน เพื่อเห็นคิวที่ค้างและความเสี่ยงได้เร็ว</p></div>
            <Link href="/dashboard" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-blue-200 px-3 py-2 text-center text-xs font-bold text-blue-700 hover:bg-blue-50">เปิดศูนย์ปฏิบัติการ</Link>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {terminals.map(item => {
              const percent = item.total ? Math.round((item.completed / item.total) * 100) : 0;
              return (
                <div key={item.key} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between"><strong>{item.label}</strong><span className="text-xs font-bold text-slate-500">{item.total} งาน</span></div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-blue-600" style={{ width: `${percent}%` }} /></div>
                  <div className="mt-3 flex justify-between text-xs text-slate-500"><span>สำเร็จ {percent}%</span><span className={item.risks ? "font-bold text-rose-600" : ""}>เสี่ยง {item.risks}</span></div>
                </div>
              );
            })}
            {!terminals.length && <p className="text-sm text-slate-500">ยังไม่มีข้อมูล Terminal</p>}
          </div>
        </article>

        <article className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-slate-900 shadow-sm sm:p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-700">Live alerts</p>
          <h2 className="mt-1 text-lg font-black">รายการที่ต้องตรวจสอบ</h2>
          <p className="mt-1 text-sm leading-6 text-amber-800">ใช้แทนกล่องแจ้งเตือนที่ซ่อนอยู่ เพื่อให้ผู้ใช้เห็นสิ่งที่ต้องทำก่อน</p>
          <div className="mt-4 space-y-3">
            {activeAlerts.map(alert => <div key={alert.id} className="rounded-xl border border-amber-200 bg-white p-3 text-sm leading-6 text-slate-700">{alert.message}</div>)}
            {!activeAlerts.length && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">ไม่พบรายการแจ้งเตือนค้างอยู่</div>}
          </div>
        </article>
      </section>
    </div>
  );
}
