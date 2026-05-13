import { mockUsageCounters } from "@/lib/mock-data/saas";

export default function UsoPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Uso y límites</h1>
        <p className="mt-1 text-sm text-violet-300">
          Counters de uso por business. Alertas a 80% y 95% del límite del plan.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {mockUsageCounters.map((c) => {
          const pct = (c.used / c.limit) * 100;
          const tone =
            pct >= 95
              ? "bg-rose-500"
              : pct >= 80
                ? "bg-amber-500"
                : "bg-emerald-500";
          return (
            <div
              key={`${c.businessId}-${c.metric}`}
              className="rounded-2xl border border-violet-800 bg-violet-900/40 p-5"
            >
              <div className="text-xs uppercase tracking-wider text-violet-300">
                {c.metric}
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-2xl font-bold tabular-nums">{c.used.toLocaleString()}</span>
                <span className="text-sm text-violet-400">
                  / {c.limit.toLocaleString()}
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-violet-800">
                <div className={`h-full ${tone}`} style={{ width: `${Math.min(pct, 100)}%` }} />
              </div>
              <div className="mt-2 text-[10px] text-violet-400">
                {pct.toFixed(1)}% · resetea {c.resetAt}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
