import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import { SearchInput } from "@/components/ui/search-input";
import { FilterBar } from "@/components/ui/filter-bar";
import { mockAuditLogs } from "@/lib/mock-data/users";
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
                    <Badge tone={actionTone[log.action] ?? "neutral"}>
                      {log.action}
                    </Badge>
                    <span className="text-sm font-medium">{log.userName}</span>
                    <span className="text-xs opacity-50">·</span>
                    <span className="text-xs opacity-60">
                      {formatDateTime(log.createdAt)} ({relativeTime(log.createdAt)})
                    </span>
                  </div>
                  <div className="mt-1 text-sm">
                    <span className="opacity-60">Entidad </span>
                    <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-[11px]">
                      {log.entity}
                    </code>{" "}
                    <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-[11px]">
                      {log.entityId}
                    </code>
                    {log.branchId && (
                      <span className="ml-2 text-xs opacity-50">
                        · {log.branchId}
                      </span>
                    )}
                  </div>
                  {log.metadata && (
                    <pre className="mt-2 overflow-x-auto rounded-lg bg-black/[0.03] p-2 text-[11px]">
                      {JSON.stringify(log.metadata, null, 2)}
                    </pre>
                  )}
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
