import { mockAuditLogs } from "@/lib/mock-data/users";
import { mockBusiness } from "@/lib/mock-data/tenancy";
import { formatDateTime } from "@/lib/utils/format";
import { SAHeader, SAStat, SACard, SATable } from "@/components/layout/super-admin-ui";
import { SAExportCsv } from "@/components/layout/super-admin-export-button";

export default function SuperAdminAuditoria() {
  const logs = mockAuditLogs;
  const usuarios = new Set(logs.map((l) => l.userName)).size;
  const acciones = new Set(logs.map((l) => l.action)).size;

  const rows = logs.map((l) => [
    formatDateTime(l.createdAt),
    mockBusiness.commercialName,
    l.userName,
    l.action,
    l.entity,
    l.ipAddress ?? "",
  ]);

  return (
    <>
      <SAHeader
        title="Auditoría global"
        description="Registro de acciones administrativas del sistema. No se muestran datos sensibles."
        actions={
          <SAExportCsv
            filename="auditoria-global.csv"
            headers={["Fecha", "Empresa", "Usuario", "Acción", "Entidad", "IP"]}
            rows={rows}
          />
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <SAStat label="Eventos" value={logs.length} />
        <SAStat label="Usuarios" value={usuarios} />
        <SAStat label="Tipos de acción" value={acciones} />
      </div>

      <SACard title={`Eventos (${logs.length})`}>
        <SATable
          head={
            <tr>
              <th className="px-4 py-2 text-left">Fecha</th>
              <th className="px-4 py-2 text-left">Empresa</th>
              <th className="px-4 py-2 text-left">Usuario</th>
              <th className="px-4 py-2 text-left">Acción</th>
              <th className="px-4 py-2 text-left">Entidad</th>
              <th className="px-4 py-2 text-left">IP</th>
            </tr>
          }
        >
          {logs.map((l) => (
            <tr key={l.id} className="hover:bg-violet-900/40">
              <td className="px-4 py-2 text-xs text-violet-300 whitespace-nowrap">{formatDateTime(l.createdAt)}</td>
              <td className="px-4 py-2 text-violet-300">{mockBusiness.commercialName}</td>
              <td className="px-4 py-2 font-medium">{l.userName}</td>
              <td className="px-4 py-2 font-mono text-[11px]">{l.action}</td>
              <td className="px-4 py-2 text-violet-200">{l.entity}</td>
              <td className="px-4 py-2 text-xs text-violet-300">{l.ipAddress ?? "—"}</td>
            </tr>
          ))}
        </SATable>
        <p className="mt-3 text-xs text-violet-400">
          La auditoría global multiempresa (todas las empresas, filtros por fecha/empresa/módulo)
          se habilita con lectura de plataforma en el servidor. Hoy muestra el registro del negocio activo.
        </p>
      </SACard>
    </>
  );
}
