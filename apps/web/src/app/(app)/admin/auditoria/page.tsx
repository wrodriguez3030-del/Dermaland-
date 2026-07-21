"use client";

import { PageHeader } from "@/components/layout/page-header";
import { Badge, Card, CardContent } from "@/components/ui";
import { SearchInput } from "@/components/ui/search-input";
import { FilterBar } from "@/components/ui/filter-bar";
import { mockAuditLogs } from "@/lib/mock-data/users";
import {
  useBranchesState,
  getBranchDisplayName,
} from "@/features/tenancy/branch-store";
import {
  auditActionLabel,
  auditEntityLabel,
  formatAuditMetadata,
} from "@/features/admin/audit-labels";
import { formatDateTime, relativeTime } from "@/lib/utils/format";

const actionTone: Record<string, "success" | "info" | "warning" | "danger" | "neutral"> = {
  "auth.login": "info",
  "branch.create": "success",
  "product_lot.quarantine": "warning",
  "inventory_count.approve": "success",
  "cash_register.open": "info",
  "proforma.create": "neutral",
  "user.invite": "info",
  "inventory_movement.adjustment_negative": "danger",
};

export default function AuditoriaPage() {
  // Carga las sucursales reales para poder mostrar el NOMBRE del branch en vez
  // del UUID técnico (puebla el cache de `getBranchDisplayName`).
  useBranchesState();
  const sorted = [...mockAuditLogs].sort(
    (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
  );
  return (
    <>
      <PageHeader
        title="Auditoría"
        description="Timeline de acciones sensibles. Inmutable y exportable. Retención mínima 12 meses."
        breadcrumbs={[{ label: "Administración" }, { label: "Auditoría" }]}
      />

      <FilterBar className="mb-4">
        <SearchInput
          placeholder="Buscar por entidad, ID o usuario…"
          containerClassName="flex-1 min-w-[240px]"
        />
        <select className="h-10 rounded-lg border border-black/15 bg-white px-3 text-sm">
          <option>Todas las acciones</option>
          <option>auth.*</option>
          <option>inventory_count.*</option>
          <option>cash_register.*</option>
          <option>proforma.*</option>
          <option>product_lot.*</option>
        </select>
        <select className="h-10 rounded-lg border border-black/15 bg-white px-3 text-sm">
          <option>Todos los usuarios</option>
        </select>
        <input
          type="date"
          className="h-10 rounded-lg border border-black/15 bg-white px-3 text-sm"
          defaultValue="2026-05-05"
        />
      </FilterBar>

      <Card>
        <CardContent className="p-0">
          <ol className="relative space-y-0">
            {sorted.map((log, i) => (
              <li
                key={log.id}
                className="flex gap-4 border-b border-black/5 p-5 last:border-b-0"
              >
                <div className="relative mt-1">
                  <div className="h-3 w-3 rounded-full bg-[color:var(--brand-primary)] ring-4 ring-[color:var(--brand-primary)]/15" />
                  {i < sorted.length - 1 && (
                    <div className="absolute left-1/2 top-3 h-full w-px -translate-x-1/2 bg-black/5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={actionTone[log.action] ?? "neutral"} title={log.action}>
                      {auditActionLabel(log.action)}
                    </Badge>
                    <span className="text-sm font-medium">{log.userName}</span>
                    <span className="text-xs opacity-50">·</span>
                    <span className="text-xs opacity-60">
                      {formatDateTime(log.createdAt)} ({relativeTime(log.createdAt)})
                    </span>
                  </div>
                  <div className="mt-1 text-sm" title={log.entityId}>
                    <span className="opacity-60">Entidad </span>
                    <span className="font-medium">{auditEntityLabel(log.entity)}</span>
                    {log.branchId && (
                      <span className="ml-2 text-xs opacity-60">
                        · {getBranchDisplayName(log.branchId, "Sucursal")}
                      </span>
                    )}
                  </div>
                  {(() => {
                    const meta = formatAuditMetadata(log.metadata);
                    if (meta.length === 0) return null;
                    return (
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs opacity-70">
                        {meta.map(({ label, value }) => (
                          <span key={label}>
                            <span className="opacity-60">{label}: </span>
                            <span className="font-medium">{value}</span>
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                  {log.ipAddress && (
                    <div className="mt-1 text-[10px] opacity-50">
                      IP {log.ipAddress}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </>
  );
}
