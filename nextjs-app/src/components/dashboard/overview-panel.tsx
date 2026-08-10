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
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="งานที่กำลังดำเนินการ" value={metrics.openJobs} detail={`จากทั้งหมด ${jobs.length} House`} icon={PackageCheck} tone="bg-blue-50 text-blue-700" />
        <MetricCard label="พร้อมวางบิล" value={metrics.readyForBilling} detail={formatMoney(metrics.pendingAmount)} icon={CircleDollarSign} tone="bg-emerald-50 text-emerald-700" />
        <MetricCard label="มูลค่าวางบิลแล้ว" value={formatMoney(metrics.billedAmount)} detail="ยอดสะสมในระบบ" icon={Clock3} tone="bg-violet-50 text-violet-700" />
        <MetricCard label="เวลาปฏิบัติงานเฉลี่ย" value={`${metrics.averageDurationMinutes || 0} นาที`} detail="จาก activity ที่เสร็จสมบูรณ์" icon={AlertTriangle} tone="bg-amber-50 text-amber-700" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div><p className="text-xs font-bold uppercase tracking-widest text-blue-700">Terminal flow</p><h2 className="mt-1 text-lg font-black">ภาพรวมปลายทาง</h2></div>
            <Link href="/dashboard" className="text-xs font-bold text-blue-700 hover:text-blue-900">เปิดศูนย์ปฏิบัติการ</Link>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {terminals.map(item => {
              const percent = item.total ? Math.round((item.completed / item.total) * 100) : 0;
              return (
                <div key={item.key} className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <div className="flex items-center justify-between"><strong>{item.label}</strong><span className="text-xs font-bold text-slate-500">{item.total} งาน</span></div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-blue-600" style={{ width: `${percent}%` }} /></div>
                  <div className="mt-3 flex justify-between text-xs text-slate-500"><span>สำเร็จ {percent}%</span><span className={item.risks ? "font-bold text-rose-600" : ""}>เสี่ยง {item.risks}</span></div>
                </div>
              );
            })}
            {!terminals.length && <p className="text-sm text-slate-500">ยังไม่มีข้อมูล Terminal</p>}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-300">Live alerts</p>
          <h2 className="mt-1 text-lg font-black">รายการที่ต้องตรวจสอบ</h2>
          <div className="mt-4 space-y-3">
            {activeAlerts.map(alert => <div key={alert.id} className="rounded-xl bg-white/8 p-3 text-sm text-slate-200 ring-1 ring-white/10">{alert.message}</div>)}
            {!activeAlerts.length && <div className="rounded-xl bg-emerald-400/10 p-4 text-sm text-emerald-200 ring-1 ring-emerald-400/20">ไม่พบรายการแจ้งเตือนค้างอยู่</div>}
          </div>
        </article>
      </section>
    </div>
  );
}
