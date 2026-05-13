import { mockSubscriptions } from "@/lib/mock-data/saas";
import { formatDate } from "@/lib/utils/format";

export default function PagosPlatformPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Pagos de suscripción</h1>
        <p className="mt-1 text-sm text-violet-300">
          Historial de cobros, intentos y webhooks de pasarela. Pasarelas: PayPal,
          Manual, CardNET (Fase 10.5+).
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-violet-800">
        <table className="w-full text-sm">
          <thead className="bg-violet-900/60 text-xs uppercase tracking-wider text-violet-300">
            <tr>
              <th className="px-4 py-3 text-left">Negocio</th>
              <th className="px-4 py-3 text-left">Plan</th>
              <th className="px-4 py-3 text-left">Pasarela</th>
              <th className="px-4 py-3 text-right">Monto</th>
              <th className="px-4 py-3 text-left">Fecha</th>
              <th className="px-4 py-3 text-left">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-violet-800 bg-violet-900/20">
            {mockSubscriptions
              .filter((s) => s.lastPaymentAt)
              .map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3">{s.businessName}</td>
                  <td className="px-4 py-3">{s.planName}</td>
                  <td className="px-4 py-3 text-xs">{s.paymentMethod}</td>
                  <td className="px-4 py-3 text-right tabular-nums">${s.monthlyPriceUSD}</td>
                  <td className="px-4 py-3 text-xs text-violet-300">
                    {s.lastPaymentAt ? formatDate(s.lastPaymentAt) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">
                      Pagado
                    </span>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
