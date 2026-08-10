const toneByStatus: Record<string, string> = {
  Billed: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  ReadyForBilling: "bg-teal-50 text-teal-700 ring-teal-600/20",
  Delivered: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  Inbound: "bg-blue-50 text-blue-700 ring-blue-600/20",
  Pending: "bg-amber-50 text-amber-700 ring-amber-600/20",
  Hold: "bg-rose-50 text-rose-700 ring-rose-600/20"
};

export function StatusBadge({ status }: { status: string }) {
  const tone = toneByStatus[status] || "bg-slate-50 text-slate-700 ring-slate-600/20";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${tone}`}>{status || "Unknown"}</span>;
}
