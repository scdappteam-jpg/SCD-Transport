import type { LucideIcon } from "lucide-react";

export function MetricCard({ label, value, detail, icon: Icon, tone }: {
  label: string;
  value: string | number;
  detail: string;
  icon: LucideIcon;
  tone: string;
}) {
  return (
    <article className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-sm shadow-slate-200/60 backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-slate-900">{value}</p>
          <p className="mt-2 text-xs text-slate-500">{detail}</p>
        </div>
        <span className={`grid size-11 place-items-center rounded-xl ${tone}`}><Icon className="size-5" /></span>
      </div>
    </article>
  );
}
