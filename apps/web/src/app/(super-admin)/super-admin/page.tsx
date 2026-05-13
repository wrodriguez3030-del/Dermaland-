import {
  Building2,
  CreditCard,
  PiggyBank,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import { mockPlatformBusinesses, mockSubscriptions } from "@/lib/mock-data/saas";
import { formatCurrency, formatDate } from "@/lib/utils/format";

export default function SuperAdminDashboard() {
  const mrr = mockSubscriptions
    .filter((s) => s.status === "active")
    .reduce((s, x) => s + x.monthlyPriceUSD, 0);
  const trial = mockSubscriptions.filter((s) => s.status === "trial").length;
  const pastDue = mockSubscriptions.filter((s) => s.status === "past_due").length;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard global</h1>
        <p className="mt-1 text-sm text-violet-300">
          Operación de la plataforma DermaLand multi-tenant.
        </p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SaaSStat label="Negocios activos" value={mockPlatformBusinesses.length} icon={Building2} />
        <SaaSStat label="MRR (USD)" value={`$${mrr}`} icon={TrendingUp} />
        <SaaSStat label="En trial" value={trial} icon={CreditCard} />
        <SaaSStat label="Past due" value={pastDue} icon={AlertTriangle} tone="danger" />
      </div>

      <div className="rounded-2xl border border-violet-800 bg-violet-900/40 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Negocios recientes</h2>
          <a
            href="/super-admin/negocios"
            className="text-xs text-violet-300 hover:text-white"
          >
            Ver todos →
          </a>
        </div>
        <div className="overflow-hidden rounded-xl border border-violet-800">
          <table className="w-full text-sm">
            <thead className="bg-violet-900/60 text-xs uppercase tracking-wider text-violet-300">
              <tr>
                <th className="px-4 py-2 text-left">Negocio</th>
                <th className="px-4 py-2 text-left">Plan</th>
                <th className="px-4 py-2 text-left">Estado</th>
                <th className="px-4 py-2 text-right">Sucursales</th>
                <th className="px-4 py-2 text-right">Usuarios</th>
                <th className="px-4 py-2 text-right">MRR</th>
                <th className="px-4 py-2 text-left">Alta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-violet-800">
              {mockPlatformBusinesses.map((b) => (
                <tr key={b.id} className="hover:bg-violet-900/40">
                  <td className="px-4 py-3 font-medium">{b.name}</td>
                  <td className="px-4 py-3">{b.plan}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        b.status === "active"
                          ? "rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300"
                          : b.status === "trial"
                            ? "rounded-full bg-violet-500/20 px-2 py-0.5 text-xs text-violet-300"
                            : "rounded-full bg-rose-500/20 px-2 py-0.5 text-xs text-rose-300"
                      }
                    >
                      {b.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{b.branches}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{b.users}</td>
                  <td className="px-4 py-3 text-right tabular-nums">${b.monthlyRevenue}</td>
                  <td className="px-4 py-3 text-xs text-violet-300">
                    {formatDate(b.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function SaaSStat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "danger";
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        tone === "danger"
          ? "border-rose-500/40 bg-rose-500/10"
          : "border-violet-800 bg-violet-900/40"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-violet-300">{label}</span>
        <Icon className="h-4 w-4 text-violet-400" />
      </div>
      <div className="mt-3 text-3xl font-semibold">{value}</div>
    </div>
  );
}
