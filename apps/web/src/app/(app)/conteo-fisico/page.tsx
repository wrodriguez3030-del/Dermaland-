"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { Ban, FileSpreadsheet, Plus, ScanBarcode, X } from "lucide-react";
import { RowActions } from "@/components/ui/row-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { useLocalSoftDelete } from "@/components/ui/use-local-soft-delete";
import { useToast } from "@/components/ui/toast";
import { formatDateTime, relativeTime } from "@/lib/utils/format";
import { isPendingInventoryCount } from "@/lib/mock-data/inventory-counts";
import { getBranchById, getWarehouseById } from "@/lib/mock-data/tenancy";
import { useCounts } from "@/features/inventory-counts/counts-store";
import { useBranches } from "@/features/tenancy/branch-store";
import { buildCountsList, buildPhysicalCountReport } from "@/features/inventory/physical-count-report";
// El módulo de exportación arrastra xlsx (~100 kB gz): se carga on-demand al exportar.
import { downloadBlob } from "@/lib/utils/download";
import {
  SortableTH,
  useTableSort,
} from "@/components/ui/sortable-table-header";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import { useProducts } from "@/features/products/product-store";
import { useAllLots, sellableStockForBranch } from "@/features/inventory/lot-store";
import {
  useScanSessions,
  cancelSession,
  sessionToCountData,
  type CountSession,
} from "@/features/inventory-counts/scan-session-store";
import type { InventoryCount } from "@/types";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const statusMeta: Record<
  string,
  { label: string; tone: "neutral" | "info" | "warning" | "success" | "danger" | "purple" }
> = {
  draft: { label: "Borrador", tone: "neutral" },
  in_progress: { label: "En progreso", tone: "info" },
  reviewing: { label: "Revisando", tone: "warning" },
  paused: { label: "Pausado", tone: "warning" },
  submitted: { label: "Enviado", tone: "info" },
  reviewed: { label: "Revisado", tone: "purple" },
  approved: { label: "Aprobado", tone: "success" },
  rejected: { label: "Rechazado", tone: "danger" },
  adjusted: { label: "Ajustado", tone: "success" },
  cancelled: { label: "Anulado", tone: "neutral" },
};

const typeLabel = (t: string) => (t === "full" ? "Total" : t === "partial" ? "Parcial" : "Spot");

const comparators = {
  date: (a: InventoryCount, b: InventoryCount) => +new Date(a.createdAt) - +new Date(b.createdAt),
  countNumber: (a: InventoryCount, b: InventoryCount) => a.countNumber.localeCompare(b.countNumber),
  status: (a: InventoryCount, b: InventoryCount) => a.status.localeCompare(b.status),
  scans: (a: InventoryCount, b: InventoryCount) => a.scanCount - b.scanCount,
  items: (a: InventoryCount, b: InventoryCount) => a.itemCount - b.itemCount,
};

function InventarioFisicoContent() {
  const toast = useToast();
  const sessions = useScanSessions();
  const products = useProducts();
  const lots = useAllLots();
  const productById = React.useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // Deep-link desde el dashboard: `?status=pending` abre el historial ya
  // filtrado a los conteos pendientes (borrador + en progreso). MISMO predicado
  // (isPendingInventoryCount) que el KPI "Inventarios pendientes".
  const params = useSearchParams();
  const pendingOnly = params.get("status") === "pending";

  // B-05a: historial de conteos REAL desde Supabase (fallback a demo si la API
  // responde 409/red). El overlay local de soft-delete sigue para cancelar en UI.
  const { counts, source: countsSource } = useCounts();
  const branchesList = useBranches();
  const branchMap = React.useMemo(
    () => new Map(branchesList.map((b) => [b.id, b])),
    [branchesList],
  );
  const branchNameOf = (id?: string) =>
    (id ? branchMap.get(id)?.name ?? getBranchById(id)?.name ?? "" : "");
  const { visible, hide } = useLocalSoftDelete(counts);
  const scopedCounts = React.useMemo(
    () => (pendingOnly ? visible.filter(isPendingInventoryCount) : visible),
    [visible, pendingOnly],
  );
  const { sort, sorted, toggle } = useTableSort(scopedCounts, "date", "desc", comparators);
  const pag = usePagination(sorted, { resetKey: pendingOnly ? "pending" : "all" });

  const exportListExcel = async () => {
    try {
      const { countsListXlsxBytes, countsListFilename } = await import(
        "@/features/inventory/physical-count-export"
      );
      const rows = buildCountsList(sorted, {
        branchName: (id) => branchNameOf(id),
      });
      downloadBlob(
        countsListFilename(new Date().toISOString()),
        countsListXlsxBytes(rows, "DermaLand", new Date().toISOString()),
        XLSX_MIME,
      );
      toast.success(`Excel generado: ${rows.length} registros.`);
    } catch {
      toast.error("No se pudo generar el Excel. Intenta nuevamente.");
    }
  };

  const exportSession = async (session: CountSession) => {
    try {
      const { physicalCountXlsxBytes, physicalCountFilename } = await import(
        "@/features/inventory/physical-count-export"
      );
      const branchName = getBranchById(session.branchId)?.name ?? "Sucursal";
      const systemQuantityFor = (pid: string) => sellableStockForBranch(lots, pid, session.branchId);
      const { count, items, scans } = sessionToCountData(session, { systemQuantityFor });
      const report = buildPhysicalCountReport({
        count,
        items,
        scans,
        movements: [],
        businessName: "DermaLand",
        generatedAt: new Date().toISOString(),
        lookups: {
          product: (pid) => productById.get(pid),
          lotUnitCost: () => undefined,
          brandName: () => "",
          categoryName: () => "",
          labName: () => "",
          branchName: (brid) => (brid ? getBranchById(brid)?.name ?? "" : ""),
          userName: () => session.startedByName ?? "",
        },
      });
      downloadBlob(physicalCountFilename(branchName, session.startedAt), physicalCountXlsxBytes(report), XLSX_MIME);
      toast.success("Excel del inventario físico generado.");
    } catch {
      toast.error("No se pudo generar el Excel. Intenta nuevamente.");
    }
  };

  const sessionDiffs = (session: CountSession) =>
    session.items.reduce(
      (n, it) => n + (it.countedQuantity - sellableStockForBranch(lots, it.productId, session.branchId) !== 0 ? 1 : 0),
      0,
    );

  return (
    <>
      <PageHeader
        title="Inventario físico"
        description="Cuenta el stock real de cada sucursal escaneando productos con lector, celular o entrada manual."
        breadcrumbs={[{ label: "Inventario físico" }]}
        actions={
          <>
            <Button size="sm" variant="outline" onClick={exportListExcel}>
              <FileSpreadsheet className="h-4 w-4" />
              Exportar Excel
            </Button>
            <Link href="/conteo-fisico/nuevo">
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Nuevo inventario
              </Button>
            </Link>
          </>
        }
      />

      {/* Inventarios reales (escaneo en este dispositivo) */}
      <h2 className="mb-2 text-sm font-semibold">Mis inventarios</h2>
      <Card className="mb-8">
        <CardContent className="p-0">
          {sessions.length === 0 ? (
            <EmptyState
              icon={ScanBarcode}
              title="Aún no has creado un inventario físico"
              description="Crea uno y empieza a escanear productos para contar el stock real."
              action={
                <Link href="/conteo-fisico/nuevo">
                  <Button size="sm">
                    <Plus className="h-4 w-4" /> Nuevo inventario
                  </Button>
                </Link>
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Fecha</TH>
                  <TH>Código</TH>
                  <TH>Sucursal</TH>
                  <TH>Tipo</TH>
                  <TH>Estado</TH>
                  <TH className="text-right">Productos</TH>
                  <TH className="text-right">Diferencias</TH>
                  <TH>Iniciado por</TH>
                  <TH className="text-right pr-4">Acciones</TH>
                </TR>
              </THead>
              <TBody>
                {sessions.map((s) => {
                  const meta = statusMeta[s.status] ?? statusMeta.draft!;
                  const active = s.status !== "approved" && s.status !== "cancelled";
                  return (
                    <TR key={s.id}>
                      <TD className="text-xs opacity-70 whitespace-nowrap">{formatDateTime(s.createdAt)}</TD>
                      <TD>
                        <Link href={`/conteo-fisico/${s.id}/escanear`} className="hover:text-[color:var(--brand-accent)]">
                          <div className="font-medium font-mono text-xs">{s.code}</div>
                          <div className="text-xs opacity-60">{s.name}</div>
                        </Link>
                      </TD>
                      <TD className="text-sm">{getBranchById(s.branchId)?.name ?? "—"}</TD>
                      <TD>
                        <Badge tone="neutral" outlined>{typeLabel(s.type)}</Badge>
                      </TD>
                      <TD>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </TD>
                      <TD className="text-right tabular-nums">{s.items.length}</TD>
                      <TD className="text-right tabular-nums">{sessionDiffs(s)}</TD>
                      <TD className="text-xs">{s.startedByName ?? "—"}</TD>
                      <TD className="pr-4">
                        <div className="flex items-center justify-end gap-2">
                          {active && (
                            <Link
                              href={`/conteo-fisico/${s.id}/escanear`}
                              className="inline-flex items-center gap-1 rounded-md border border-black/10 px-2 py-1 text-xs hover:border-[color:var(--brand-primary)]/40"
                            >
                              <ScanBarcode className="h-3 w-3" /> Escanear
                            </Link>
                          )}
                          <RowActions
                            viewHref={`/conteo-fisico/${s.id}/escanear`}
                            canEdit={false}
                            canDelete={false}
                            customActions={[
                              {
                                label: "Exportar Excel",
                                icon: FileSpreadsheet,
                                onClick: () => exportSession(s),
                              },
                              ...(active
                                ? [
                                    {
                                      label: "Anular",
                                      icon: Ban,
                                      destructive: true,
                                      onClick: () => {
                                        cancelSession(s.id);
                                        toast.success(`Inventario ${s.code} anulado.`);
                                      },
                                      confirm: {
                                        title: "Anular inventario",
                                        message: `¿Anular ${s.code}? Lo contado quedará archivado sin aplicar ajustes.`,
                                      },
                                    },
                                  ]
                                : []),
                            ]}
                          />
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Historial de ejemplo (datos de demostración) */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          Historial{pendingOnly ? ` — pendientes (${sorted.length})` : ""}
        </h2>
        {pendingOnly && (
          <Link href="/conteo-fisico">
            <Button variant="ghost" size="sm">
              <X className="h-4 w-4" /> Ver todo el historial
            </Button>
          </Link>
        )}
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <SortableTH sortKey="date" state={sort} onClick={toggle}>Fecha</SortableTH>
                <SortableTH sortKey="countNumber" state={sort} onClick={toggle}>Código</SortableTH>
                <TH>Sucursal</TH>
                <TH>Tipo</TH>
                <SortableTH sortKey="status" state={sort} onClick={toggle}>Estado</SortableTH>
                <SortableTH sortKey="scans" state={sort} onClick={toggle} align="right">Escaneos</SortableTH>
                <SortableTH sortKey="items" state={sort} onClick={toggle} align="right">Items</SortableTH>
                <TH>Iniciado</TH>
                <TH className="text-right pr-4">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {pag.pageItems.map((c) => {
                const branchLabel = branchNameOf(c.branchId);
                const warehouse = getWarehouseById(c.warehouseId);
                const meta = statusMeta[c.status] ?? statusMeta.draft!;
                const cancellable = c.status === "draft" || c.status === "in_progress" || c.status === "paused";
                return (
                  <TR key={c.id}>
                    <TD className="text-xs opacity-70 whitespace-nowrap">{formatDateTime(c.createdAt)}</TD>
                    <TD>
                      <Link href={`/conteo-fisico/${c.id}`} className="hover:text-[color:var(--brand-accent)]">
                        <div className="font-medium font-mono text-xs">{c.countNumber}</div>
                        {c.notes && <div className="mt-0.5 text-xs opacity-60">{c.notes}</div>}
                      </Link>
                    </TD>
                    <TD>
                      <div className="text-sm">{branchLabel}</div>
                      <div className="text-xs opacity-60">{warehouse?.name}</div>
                    </TD>
                    <TD>
                      <Badge tone="neutral" outlined>{typeLabel(c.countType)}</Badge>
                    </TD>
                    <TD>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </TD>
                    <TD className="text-right tabular-nums">{c.scanCount}</TD>
                    <TD className="text-right tabular-nums">{c.itemCount}</TD>
                    <TD className="text-xs">
                      {c.startedAt ? formatDateTime(c.startedAt) : "—"}
                      {c.startedAt && <div className="opacity-50">{relativeTime(c.startedAt)}</div>}
                    </TD>
                    <TD className="pr-4">
                      <RowActions
                        viewHref={`/conteo-fisico/${c.id}`}
                        canEdit={false}
                        canDelete={false}
                        customActions={
                          cancellable
                            ? [
                                {
                                  label: "Cancelar",
                                  icon: Ban,
                                  destructive: true,
                                  onClick: () => {
                                    hide(c.id);
                                    toast.success(`Inventario ${c.countNumber} cancelado.`);
                                  },
                                  confirm: {
                                    title: "Cancelar inventario",
                                    message: `¿Cancelar ${c.countNumber}? Los escaneos quedarán archivados sin aplicar ajustes.`,
                                  },
                                },
                              ]
                            : []
                        }
                      />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          {sorted.length > 0 && (
            <DataPagination
              page={pag.page}
              pageSize={pag.pageSize}
              total={pag.total}
              onPageChange={pag.setPage}
              onPageSizeChange={pag.setPageSize}
            />
          )}
        </CardContent>
      </Card>
      <toast.Toast />
    </>
  );
}

export default function InventarioFisicoPage() {
  return (
    <React.Suspense
      fallback={<div className="p-6 text-sm opacity-60">Cargando inventarios…</div>}
    >
      <InventarioFisicoContent />
    </React.Suspense>
  );
}
