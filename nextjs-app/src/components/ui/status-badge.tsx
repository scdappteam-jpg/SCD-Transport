const toneByStatus: Record<string, string> = {
  Billed: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  ReadyForBilling: "bg-teal-50 text-teal-700 ring-teal-600/20",
  Delivered: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  Inbound: "bg-blue-50 text-blue-700 ring-blue-600/20",
  Pending: "bg-amber-50 text-amber-700 ring-amber-600/20",
  Hold: "bg-rose-50 text-rose-700 ring-rose-600/20",
  Queue: "bg-blue-50 text-blue-700 ring-blue-600/20",
  Accepted: "bg-cyan-50 text-cyan-700 ring-cyan-600/20",
  InProcess: "bg-amber-50 text-amber-700 ring-amber-600/20",
  Completed: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  Cancelled: "bg-slate-50 text-slate-600 ring-slate-500/20",
  Rejected: "bg-rose-50 text-rose-700 ring-rose-600/20"
};

const labelByStatus: Record<string, string> = {
  Billed: "วางบิลแล้ว · Billed",
  ReadyForBilling: "พร้อมวางบิล · Ready",
  Delivered: "ส่งสำเร็จ · Delivered",
  Inbound: "รับเข้าคลัง · Inbound",
  Pending: "รอดำเนินการ · Pending",
  Hold: "พักงาน · Hold",
  Queue: "รอคิว · Queue",
  Accepted: "อนุมัติแล้ว · Accepted",
  InProcess: "กำลังทำงาน · In process",
  Completed: "เสร็จสิ้น · Completed",
  Cancelled: "ยกเลิก · Cancelled",
  Rejected: "ไม่ผ่าน · Rejected"
};

export function StatusBadge({ status }: { status: string }) {
  const tone = toneByStatus[status] || "bg-slate-50 text-slate-700 ring-slate-600/20";
  return <span className={`inline-flex max-w-full rounded-full px-2.5 py-1 text-[11px] font-bold leading-snug ring-1 ring-inset ${tone}`}>{labelByStatus[status] || status || "ไม่ทราบสถานะ · Unknown"}</span>;
}
