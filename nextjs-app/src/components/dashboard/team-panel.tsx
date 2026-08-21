export function TeamPanel({ data }: { data: BootstrapResponse }) {
  const stats = new Map(data.dashboard.staffStats.map(item => [item.userId, item]));
  return (
    <section className="space-y-4">
      <header className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-blue-700">Operations Team</p>
        <h2 className="mt-1 text-xl font-black">ทีมปฏิบัติการ</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">ดูผู้รับผิดชอบ งานสำเร็จ และ KPI แบบอ่านง่ายสำหรับหน้างาน</p>
      </header>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {data.users.map(user => {
        const item = stats.get(user.id);
        return <article key={user.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-700 font-black text-white">{user.name.slice(0, 2).toUpperCase()}</span><div className="min-w-0"><h3 className="break-words font-black">{user.name}</h3><p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{user.role}{user.vehiclePlate ? ` · ${user.vehiclePlate}` : ""}</p></div></div><div className="mt-5 grid grid-cols-1 gap-2 text-left sm:grid-cols-3 sm:text-center"><div className="rounded-xl bg-slate-50 p-3"><strong className="block text-lg">{item?.totalJobs || 0}</strong><span className="text-xs text-slate-500">งานทั้งหมด</span></div><div className="rounded-xl bg-slate-50 p-3"><strong className="block text-lg">{item?.completedJobs || 0}</strong><span className="text-xs text-slate-500">สำเร็จ</span></div><div className="rounded-xl bg-blue-50 p-3"><strong className="block text-lg text-blue-700">{item?.kpi || 0}%</strong><span className="text-xs text-blue-700">KPI</span></div></div></article>;
      })}
      </div>
    </section>
  );
}
