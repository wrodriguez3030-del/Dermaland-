import { mockSubscriptions } from "@/lib/mock-data/saas";
import { formatDate } from "@/lib/utils/format";

export default function SuscripcionesPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Suscripciones</h1>
        <p className="mt-1 text-sm text-violet-300">
          Estado de cobro por business. Past due ≥ 7 días suspende módulos no-críticos.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-violet-800">
        <table className="w-full text-sm">
          <thead className="bg-violet-900/60 text-xs uppercase tracking-wider text-violet-300">
            <tr>
              <th className="px-4 py-3 text-left">Business</th>
              <th className="px-4 py-3 text-left">Plan</th>
              <th className="px-4 py-3 text-left">Estado</th>
              <th className="px-4 py-3 text-left">Período</th>
              <th className="px-4 py-3 text-left">Método</th>
              <th className="px-4 py-3 text-right">Precio</th>
              <th className="px-4 py-3 text-left">Último pago</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-violet-800 bg-violet-900/20">
            {mockSubscriptions.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3 font-medium">{s.businessName}</td>
                <td className="px-4 py-3">{s.planName}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      s.status === "active"
                        ? "rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300"
                        : s.status === "trial"
                          ? "rounded-full bg-violet-500/20 px-2 py-0.5 text-xs text-violet-300"
                          : s.status === "past_due"
                            ? "rounded-full bg-rose-500/20 px-2 py-0.5 text-xs text-rose-300"
                            : "rounded-full bg-violet-500/20 px-2 py-0.5 text-xs text-violet-200"
                    }
                  >
                    {s.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-violet-300">
                  {formatDate(s.currentPeriodStart)} → {formatDate(s.currentPeriodEnd)}
                </td>
                <td className="px-4 py-3 text-xs">{s.paymentMethod ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">${s.monthlyPriceUSD}</td>
                <td className="px-4 py-3 text-xs text-violet-300">
                  {s.lastPaymentAt ? formatDate(s.lastPaymentAt) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
