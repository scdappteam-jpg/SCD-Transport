export function TeamPanel({ data }: { data: BootstrapResponse }) {
  const stats = new Map(data.dashboard.staffStats.map(item => [item.userId, item]));
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {data.users.map(user => {
        const item = stats.get(user.id);
        return <article key={user.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-blue-700 font-black text-white">{user.name.slice(0, 2).toUpperCase()}</span><div><h3 className="font-black">{user.name}</h3><p className="text-xs font-semibold text-slate-500">{user.role}{user.vehiclePlate ? ` · ${user.vehiclePlate}` : ""}</p></div></div><div className="mt-5 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-slate-50 p-3"><strong className="block text-lg">{item?.totalJobs || 0}</strong><span className="text-[10px] text-slate-500">งานทั้งหมด</span></div><div className="rounded-xl bg-slate-50 p-3"><strong className="block text-lg">{item?.completedJobs || 0}</strong><span className="text-[10px] text-slate-500">สำเร็จ</span></div><div className="rounded-xl bg-slate-50 p-3"><strong className="block text-lg text-blue-700">{item?.kpi || 0}%</strong><span className="text-[10px] text-slate-500">KPI</span></div></div></article>;
      })}
    </section>
  );
}
