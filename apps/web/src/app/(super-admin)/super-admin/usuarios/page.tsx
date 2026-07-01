import { mockUsers, roleDefinitions } from "@/lib/mock-data/users";
import { mockBusiness } from "@/lib/mock-data/tenancy";
import { formatDateTime } from "@/lib/utils/format";
import { SAHeader, SAStat, SACard, SATable, SABadge } from "@/components/layout/super-admin-ui";
import { SAExportCsv } from "@/components/layout/super-admin-export-button";

const roleLabel = (key: string) => roleDefinitions.find((r) => r.key === key)?.label ?? key;
const statusTone = (s: string) => (s === "active" ? "success" : s === "invited" ? "info" : "neutral");
const statusLabel = (s: string) => (s === "active" ? "Activo" : s === "invited" ? "Invitado" : "Inactivo");

export default function SuperAdminUsuarios() {
  const users = mockUsers;
  const activos = users.filter((u) => u.status === "active").length;
  const invitados = users.filter((u) => u.status === "invited").length;
  const sinMfa = users.filter((u) => !u.twoFactorEnabled).length;

  return (
    <>
      <SAHeader
        title="Usuarios globales"
        description="Todos los usuarios del sistema. Nunca se muestran contraseñas ni tokens."
        actions={
          <SAExportCsv
            filename="usuarios-globales.csv"
            headers={["Usuario", "Email", "Empresa", "Rol", "Estado", "MFA", "Último acceso"]}
            rows={users.map((u) => [
              u.fullName,
              u.email,
              mockBusiness.commercialName,
              roleLabel(u.role),
              statusLabel(u.status),
              u.twoFactorEnabled ? "Sí" : "No",
              u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Nunca",
            ])}
          />
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SAStat label="Usuarios" value={users.length} />
        <SAStat label="Activos" value={activos} tone="success" />
        <SAStat label="Invitados" value={invitados} />
        <SAStat label="Sin MFA" value={sinMfa} tone={sinMfa ? "warning" : undefined} />
      </div>

      <SACard title={`Usuarios (${users.length})`}>
        <SATable
          head={
            <tr>
              <th className="px-4 py-2 text-left">Usuario</th>
              <th className="px-4 py-2 text-left">Email</th>
              <th className="px-4 py-2 text-left">Empresa</th>
              <th className="px-4 py-2 text-left">Rol</th>
              <th className="px-4 py-2 text-left">Estado</th>
              <th className="px-4 py-2 text-center">MFA</th>
              <th className="px-4 py-2 text-left">Último acceso</th>
            </tr>
          }
        >
          {users.map((u) => (
            <tr key={u.id} className="hover:bg-violet-900/40">
              <td className="px-4 py-3 font-medium">{u.fullName}</td>
              <td className="px-4 py-3 text-violet-200">{u.email}</td>
              <td className="px-4 py-3 text-violet-300">{mockBusiness.commercialName}</td>
              <td className="px-4 py-3">
                <SABadge tone={u.role === "super_admin" ? "danger" : "info"}>{roleLabel(u.role)}</SABadge>
              </td>
              <td className="px-4 py-3">
                <SABadge tone={statusTone(u.status)}>{statusLabel(u.status)}</SABadge>
              </td>
              <td className="px-4 py-3 text-center">
                {u.twoFactorEnabled ? (
                  <SABadge tone="success">Sí</SABadge>
                ) : (
                  <SABadge tone="warning">No</SABadge>
                )}
              </td>
              <td className="px-4 py-3 text-xs text-violet-300">
                {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Nunca"}
              </td>
            </tr>
          ))}
        </SATable>
        <p className="mt-3 text-xs text-violet-400">
          Acciones (editar rol, activar/desactivar, reenviar invitación) llegan con la
          gestión multiempresa por servidor. No se exponen secretos ni service_role.
        </p>
      </SACard>
    </>
  );
}
