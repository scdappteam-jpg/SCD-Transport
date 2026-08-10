export default function Loading() {
  return (
    <main className="grid min-h-screen place-items-center">
      <div className="flex items-center gap-3 text-sm font-semibold text-slate-600">
        <span className="size-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        กำลังเตรียมระบบ
      </div>
    </main>
  );
}
