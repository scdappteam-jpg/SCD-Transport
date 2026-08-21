import type { LucideIcon } from "lucide-react";

export function MetricCard({ label, value, detail, icon: Icon, tone }: {
  label: string;
  value: string | number;
  detail: string;
  icon: LucideIcon;
  tone: string;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/50 backdrop-blur sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-bold leading-snug text-slate-500">{label}</p>
          <p className="mt-2 break-words text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{value}</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
        </div>
        <span className={`grid size-10 shrink-0 place-items-center rounded-lg ${tone} sm:size-11`}><Icon className="size-5" /></span>
      </div>
    </article>
  );
}
