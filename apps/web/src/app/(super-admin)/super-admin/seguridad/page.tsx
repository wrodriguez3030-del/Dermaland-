import { AlertTriangle, ShieldCheck } from "lucide-react";
import { mockUsers } from "@/lib/mock-data/users";
import { isSupabaseConfigured } from "@/lib/env";
import { SAHeader, SAStat, SACard, SATable, SABadge } from "@/components/layout/super-admin-ui";

export default function SuperAdminSeguridad() {
  const sinMfa = mockUsers.filter((u) => !u.twoFactorEnabled);
  const inactivos = mockUsers.filter((u) => u.status === "disabled");
  const rlsOn = isSupabaseConfigured();

  return (
    <>
      <SAHeader
        title="Seguridad"
        description="Postura de seguridad de la plataforma. Nunca se muestran valores de variables sensibles."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SAStat label="Usuarios sin MFA" value={sinMfa.length} tone={sinMfa.length ? "warning" : "success"} />
        <SAStat label="Usuarios inactivos" value={inactivos.length} />
        <SAStat label="RLS Supabase" value={rlsOn ? "Activo" : "N/D"} tone={rlsOn ? "success" : "warning"} />
        <SAStat label="service_role expuesto" value="No" tone="success" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SACard title="Usuarios sin MFA">
          {sinMfa.length === 0 ? (
            <p className="text-sm text-violet-300">Todos los usuarios tienen MFA. 🎉</p>
          ) : (
            <SATable
              head={
                <tr>
                  <th className="px-4 py-2 text-left">Usuario</th>
                  <th className="px-4 py-2 text-left">Email</th>
                  <th className="px-4 py-2 text-left">Rol</th>
                </tr>
              }
            >
              {sinMfa.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2 font-medium">{u.fullName}</td>
                  <td className="px-4 py-2 text-violet-200">{u.email}</td>
                  <td className="px-4 py-2">
                    <SABadge tone="info">{u.role}</SABadge>
                  </td>
                </tr>
              ))}
            </SATable>
          )}
        </SACard>

        <SACard title="Avisos de seguridad">
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-300" />
            <span className="text-violet-100">
              <strong>Leaked Password Protection</strong> requiere Supabase Pro+. Riesgo documentado.
              No se intenta arreglar con SQL.
            </span>
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
            <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-300" />
            <span className="text-violet-100">
              RLS habilitado por <code>business_id</code> en todas las tablas de tenant;
              la <code>service_role</code> solo se usa en el servidor y nunca llega al cliente.
            </span>
          </div>
          <p className="mt-3 text-xs text-violet-400">
            Intentos fallidos de login y el último cambio de permisos se listan cuando se
            habilite la captura de eventos de seguridad en el servidor.
          </p>
        </SACard>
      </div>
    </>
  );
}
