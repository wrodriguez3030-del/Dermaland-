"use client";

import Link from "next/link";
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
import { Ban, Plus, ScanBarcode } from "lucide-react";
import { RowActions } from "@/components/ui/row-actions";
import { useLocalSoftDelete } from "@/components/ui/use-local-soft-delete";
import { useToast } from "@/components/ui/toast";
import {
  formatDateTime,
  relativeTime,
} from "@/lib/utils/format";
import { mockInventoryCounts } from "@/lib/mock-data/inventory-counts";
import { getBranchById, getWarehouseById } from "@/lib/mock-data/tenancy";
import {
  SortableTH,
  useTableSort,
} from "@/components/ui/sortable-table-header";
import type { InventoryCount } from "@/types";

const statusMeta: Record<
  string,
  { label: string; tone: "neutral" | "info" | "warning" | "success" | "danger" | "purple" }
> = {
  draft: { label: "Borrador", tone: "neutral" },
  in_progress: { label: "En progreso", tone: "info" },
  paused: { label: "Pausado", tone: "warning" },
  submitted: { label: "Enviado", tone: "info" },
  reviewed: { label: "Revisado", tone: "purple" },
  approved: { label: "Aprobado", tone: "success" },
  rejected: { label: "Rechazado", tone: "danger" },
  adjusted: { label: "Ajustado", tone: "success" },
  cancelled: { label: "Cancelado", tone: "neutral" },
};

const comparators = {
  date: (a: InventoryCount, b: InventoryCount) =>
    +new Date(a.createdAt) - +new Date(b.createdAt),
  countNumber: (a: InventoryCount, b: InventoryCount) =>
    a.countNumber.localeCompare(b.countNumber),
  status: (a: InventoryCount, b: InventoryCount) =>
    a.status.localeCompare(b.status),
  scans: (a: InventoryCount, b: InventoryCount) => a.scanCount - b.scanCount,
  items: (a: InventoryCount, b: InventoryCount) => a.itemCount - b.itemCount,
};

export default function ConteoFisicoPage() {
  const { visible, hide } = useLocalSoftDelete(mockInventoryCounts);
  const toast = useToast();
  const { sort, sorted, toggle } = useTableSort(
    visible,
    "date",
    "desc",
    comparators,
  );
  return (
    <>
      <PageHeader
        title="Conteo físico"
        description="Sesiones de conteo por sucursal. Acumulación por escaneos — entrada manual solo con permiso."
        breadcrumbs={[{ label: "Conteo físico" }]}
        actions={
          <Link href="/conteo-fisico/nuevo">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Nuevo conteo
            </Button>
          </Link>
        }
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <SortableTH sortKey="date" state={sort} onClick={toggle}>
                  Fecha
                </SortableTH>
                <SortableTH sortKey="countNumber" state={sort} onClick={toggle}>
                  Conteo
                </SortableTH>
                <TH>Sucursal</TH>
                <TH>Tipo</TH>
                <SortableTH sortKey="status" state={sort} onClick={toggle}>
                  Estado
                </SortableTH>
                <SortableTH
                  sortKey="scans"
                  state={sort}
                  onClick={toggle}
                  align="right"
                >
                  Escaneos
                </SortableTH>
                <SortableTH
                  sortKey="items"
                  state={sort}
                  onClick={toggle}
                  align="right"
                >
                  Items
                </SortableTH>
                <TH>Iniciado</TH>
                <TH className="text-right pr-4">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {sorted.map((c) => {
                const branch = getBranchById(c.branchId);
                const warehouse = getWarehouseById(c.warehouseId);
                const meta = statusMeta[c.status] ?? statusMeta.draft;
                const cancellable =
                  c.status === "draft" || c.status === "in_progress" || c.status === "paused";
                return (
                  <TR key={c.id}>
                    <TD className="text-xs opacity-70 whitespace-nowrap">
                      {formatDateTime(c.createdAt)}
                    </TD>
                    <TD>
                      <Link
                        href={`/conteo-fisico/${c.id}`}
                        className="hover:text-[color:var(--brand-accent)]"
                      >
                        <div className="font-medium font-mono text-xs">
                          {c.countNumber}
                        </div>
                        {c.notes && (
                          <div className="mt-0.5 text-xs opacity-60">
                            {c.notes}
                          </div>
                        )}
                      </Link>
                    </TD>
                    <TD>
                      <div className="text-sm">{branch?.name}</div>
                      <div className="text-xs opacity-60">{warehouse?.name}</div>
                    </TD>
                    <TD>
                      <Badge tone="neutral" outlined>
                        {c.countType === "full"
                          ? "Total"
                          : c.countType === "partial"
                            ? "Parcial"
                            : "Spot"}
                      </Badge>
                    </TD>
                    <TD>
                      <Badge tone={meta!.tone}>{meta!.label}</Badge>
                    </TD>
                    <TD className="text-right tabular-nums">{c.scanCount}</TD>
                    <TD className="text-right tabular-nums">{c.itemCount}</TD>
                    <TD className="text-xs">
                      {c.startedAt ? formatDateTime(c.startedAt) : "—"}
                      {c.startedAt && (
                        <div className="opacity-50">
                          {relativeTime(c.startedAt)}
                        </div>
                      )}
                    </TD>
                    <TD className="pr-4">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/conteo-fisico/${c.id}/movil`}
                          className="inline-flex items-center gap-1 rounded-md border border-black/10 px-2 py-1 text-xs hover:border-[color:var(--brand-primary)]/40"
                          title="Modo móvil"
                        >
                          <ScanBarcode className="h-3 w-3" /> Móvil
                        </Link>
                        <RowActions
                          viewHref={`/conteo-fisico/${c.id}`}
                          editHref={`/conteo-fisico/${c.id}/editar`}
                          canEdit={cancellable}
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
                                      toast.success(
                                        `Conteo ${c.countNumber} cancelado.`,
                                      );
                                    },
                                    confirm: {
                                      title: "Cancelar conteo",
                                      message: `¿Cancelar la sesión ${c.countNumber}? Los escaneos registrados quedarán archivados sin aplicar ajustes.`,
                                    },
                                  },
                                ]
                              : []
                          }
                        />
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>
      <toast.Toast />
    </>
  );
}
