"use client";

import { mockPlatformBusinesses } from "@/lib/mock-data/saas";
import { formatDate } from "@/lib/utils/format";
import { Ban, UserCog } from "lucide-react";
import { RowActions } from "@/components/ui/row-actions";
import { useLocalSoftDelete } from "@/components/ui/use-local-soft-delete";
import { useToast } from "@/components/ui/toast";

export default function NegociosPage() {
  const { visible, hide } = useLocalSoftDelete(mockPlatformBusinesses);
  const toast = useToast();
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Negocios</h1>
        <p className="mt-1 text-sm text-violet-300">
          Tenants de la plataforma. Cada uno tiene su propio scope y datos
          aislados por RLS.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-violet-800">
        <table className="w-full text-sm">
          <thead className="bg-violet-900/60 text-xs uppercase tracking-wider text-violet-300">
            <tr>
              <th className="px-4 py-3 text-left">Negocio</th>
              <th className="px-4 py-3 text-left">País</th>
              <th className="px-4 py-3 text-left">Plan</th>
              <th className="px-4 py-3 text-left">Estado</th>
              <th className="px-4 py-3 text-right">Sucursales</th>
              <th className="px-4 py-3 text-right">Usuarios</th>
              <th className="px-4 py-3 text-right">MRR</th>
              <th className="px-4 py-3 text-left">Alta</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-violet-800 bg-violet-900/20">
            {visible.map((b) => (
              <tr key={b.id} className="hover:bg-violet-900/40">
                <td className="px-4 py-3">
                  <div className="font-medium">{b.name}</div>
                  <div className="text-xs text-violet-400 font-mono">{b.id}</div>
                </td>
                <td className="px-4 py-3">{b.country}</td>
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
                <td className="px-4 py-3 text-xs text-violet-300">{formatDate(b.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-block">
                    <RowActions
                      viewHref={`/super-admin/negocios/${b.id}`}
                      editHref={`/super-admin/negocios/${b.id}/editar`}
                      canDelete={false}
                      customActions={[
                        {
                          label: "Impersonar",
                          icon: UserCog,
                          onClick: () =>
                            toast.success(
                              `Sesión de impersonación abierta para ${b.name}.`,
                            ),
                          confirm: {
                            title: "Iniciar impersonación",
                            message: `¿Impersonar al admin de ${b.name}? La acción queda en auditoría.`,
                          },
                        },
                        {
                          label: "Suspender",
                          icon: Ban,
                          destructive: true,
                          onClick: () => {
                            hide(b.id);
                            toast.success(`Negocio ${b.name} suspendido.`);
                          },
                          confirm: {
                            title: "Suspender negocio",
                            message: `¿Suspender ${b.name}? Los usuarios del tenant perderán acceso pero los datos quedan intactos.`,
                          },
                        },
                      ]}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <toast.Toast />
    </>
  );
}
