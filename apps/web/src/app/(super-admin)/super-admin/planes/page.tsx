import { Check, Sparkles } from "lucide-react";
import { mockPlans } from "@/lib/mock-data/saas";

export default function PlanesPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Planes</h1>
        <p className="mt-1 text-sm text-violet-300">
          Precios y límites. Cambios afectan a nuevos negocios — los existentes
          mantienen su plan a menos que upgradees explícitamente.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-5">
        {mockPlans.map((p) => (
          <div
            key={p.id}
            className={`flex flex-col rounded-2xl border p-5 ${
              p.highlight
                ? "border-violet-400 bg-violet-700/30"
                : "border-violet-800 bg-violet-900/40"
            }`}
          >
            <div className="flex items-center gap-2">
              {p.highlight && <Sparkles className="h-4 w-4 text-violet-300" />}
              <h3 className="text-lg font-semibold">{p.name}</h3>
            </div>
            <div className="mt-3 text-2xl font-bold">
              {p.monthlyPriceUSD === 0 ? "Custom" : `$${p.monthlyPriceUSD}`}
              {p.monthlyPriceUSD > 0 && (
                <span className="ml-1 text-sm font-normal text-violet-300">/mes</span>
              )}
            </div>
            <ul className="mt-4 flex-1 space-y-2 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 text-emerald-300 shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 space-y-1 border-t border-violet-700 pt-3 text-xs text-violet-300">
              <div>{p.limits.users} usuarios · {p.limits.branches} sucursales</div>
              <div>{p.limits.products.toLocaleString()} productos</div>
              <div>WhatsApp {p.limits.whatsappMessages.toLocaleString()}/mes</div>
              {p.limits.dgiiEnabled && <div>✔ DGII e-CF</div>}
              {p.limits.aiEnabled && <div>✔ Agentes IA</div>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
