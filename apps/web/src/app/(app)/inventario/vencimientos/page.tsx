"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Button,
  Select,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { FilterBar } from "@/components/ui/filter-bar";
import { StatCard } from "@/components/ui/stat-card";
import { CalendarClock, AlertTriangle, ShieldAlert, X } from "lucide-react";
import { RowActions } from "@/components/ui/row-actions";
import { useProducts } from "@/features/products/product-store";
import {
  getBranchDisplayName,
  useActiveBranches,
} from "@/features/tenancy/branch-store";
import { daysUntil, formatDate } from "@/lib/utils/format";
import { lotStatusBadge } from "@/features/inventory/lot-badges";
import {
  useAllLots,
  expiryStatus,
  type ExpiryStatus,
} from "@/features/inventory/lot-store";
import {
  matchesExpiryDayFilter,
  type ExpiryDayFilter,
} from "@/features/inventory/lot-selectors";

const rowBg: Record<ExpiryStatus, string> = {
  expired: "bg-rose-50",
  soon: "bg-rose-50/60",
  warn: "bg-amber-50/60",
  ok: "",
};
const tone: Record<ExpiryStatus, "danger" | "warning" | "success"> = {
  expired: "danger",
  soon: "danger",
  warn: "warning",
  ok: "success",
};

type DayFilter = ExpiryDayFilter;
const DAY_FILTERS: readonly DayFilter[] = ["all", "expired", "30", "60", "90"];

function VencimientosContent() {
  const activeBranches = useActiveBranches();
  // Deep-link desde el dashboard: `?days=90` abre la lista ya filtrada a 90 días
  // y `?branch=<id>` la acota a una sucursal. NUNCA se muestra el UUID.
  const params = useSearchParams();
  const initialDays = (() => {
    const d = params.get("days");
    return d && DAY_FILTERS.includes(d as DayFilter) ? (d as DayFilter) : "all";
  })();
  const [branch, setBranch] = React.useState(() => params.get("branch") ?? "");
  const [dayFilter, setDayFilter] = React.useState<DayFilter>(initialDays);
  const rawLots = useAllLots();
  const products = useProducts();
  const productById = React.useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  // Vencimientos operativos: solo lotes de sucursales ACTIVAS.
  const activeBranchIds = new Set(activeBranches.map((b) => b.id));
  const allLots = rawLots
    .filter((l) => activeBranchIds.has(l.branchId))
    .sort((a, b) => +new Date(a.expiresAt) - +new Date(b.expiresAt));

  const expired = allLots.filter((l) => daysUntil(l.expiresAt) < 0);
  const lt15 = allLots.filter((l) => {
    const d = daysUntil(l.expiresAt);
    return d >= 0 && d < 15;
  });
  const lt30 = allLots.filter((l) => {
    const d = daysUntil(l.expiresAt);
    return d >= 15 && d < 30;
  });
  const lt90 = allLots.filter((l) => {
    const d = daysUntil(l.expiresAt);
    return d >= 30 && d < 90;
  });

  const hasFilters = branch !== "" || dayFilter !== "all";
  const clear = () => {
    setBranch("");
    setDayFilter("all");
  };

  const filtered = allLots.filter((l) => {
    if (branch && l.branchId !== branch) return false;
    // Mismo predicado que el selector del dashboard (lot-selectors) → el KPI
    // "Lotes próximos a vencer" y `?days=90` cuentan exactamente lo mismo.
    return matchesExpiryDayFilter(l.expiresAt, dayFilter);
  });

  return (
    <>
      <PageHeader
        title="Alertas de vencimiento"
        description="Niveles 15 / 30 / 60 / 90 días. El POS bloquea la venta de lotes vencidos."
        breadcrumbs={[
          { label: "Inventario", href: "/inventario" },
          { label: "Vencimientos" },
        ]}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Vencidos"
          value={expired.length}
          icon={ShieldAlert}
          tone="danger"
          hint="Bloqueados para venta"
        />
        <StatCard
          label="< 15 días"
          value={lt15.length}
          icon={AlertTriangle}
          tone="danger"
          hint="Crítico — promoción urgente"
        />
        <StatCard label="15-30 días" value={lt30.length} icon={CalendarClock} tone="warning" />
        <StatCard label="30-90 días" value={lt90.length} icon={CalendarClock} />
      </div>

      <FilterBar className="mb-4">
        <Select value={branch} onChange={(e) => setBranch(e.target.value)}>
          <option value="">Todas las sucursales</option>
          {activeBranches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
        <Select
          value={dayFilter}
          onChange={(e) => setDayFilter(e.target.value as DayFilter)}
        >
          <option value="all">Todos los plazos</option>
          <option value="expired">Vencidos</option>
          <option value="30">Hasta 30 días</option>
          <option value="60">Hasta 60 días</option>
          <option value="90">Hasta 90 días</option>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clear}>
            <X className="h-4 w-4" /> Limpiar filtros
          </Button>
        )}
      </FilterBar>

      <Card>
        <CardHeader>
          <CardTitle>
            Lotes por proximidad a vencimiento ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Producto</TH>
                <TH>Lote</TH>
                <TH>Sucursal</TH>
                <TH className="text-right">Cantidad</TH>
                <TH>Vence</TH>
                <TH>Días</TH>
                <TH>Estado</TH>
                <TH className="text-right pr-4">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.length === 0 && (
                <TR>
                  <TD colSpan={8} className="py-10 text-center text-sm opacity-60">
                    No hay lotes que coincidan con los filtros.
                  </TD>
                </TR>
              )}
              {filtered.map((lot) => {
                const p = productById.get(lot.productId);
                const days = daysUntil(lot.expiresAt);
                const st = expiryStatus(lot.expiresAt);
                return (
                  <TR key={lot.id} className={rowBg[st]}>
                    <TD>
                      <div className="text-sm">{p?.name ?? "Producto no encontrado"}</div>
                      <div className="font-mono text-xs opacity-60">{p?.sku}</div>
                    </TD>
                    <TD className="font-mono text-xs">{lot.lotNumber}</TD>
                    <TD className="text-xs opacity-70">
                      {getBranchDisplayName(lot.branchId)}
                    </TD>
                    <TD className="text-right tabular-nums">{lot.currentQuantity}</TD>
                    <TD className="text-xs">{formatDate(lot.expiresAt)}</TD>
                    <TD>
                      <Badge tone={tone[st]}>
                        {days < 0 ? `${Math.abs(days)} d. vencido` : `${days} d.`}
                      </Badge>
                    </TD>
                    <TD>{lotStatusBadge(lot.status)}</TD>
                    <TD className="pr-4">
                      <RowActions
                        viewHref={`/productos/${lot.productId}`}
                        canEdit={false}
                        canDelete={false}
                      />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

export default function VencimientosPage() {
  return (
    <React.Suspense
      fallback={<div className="p-6 text-sm opacity-60">Cargando vencimientos…</div>}
    >
      <VencimientosContent />
    </React.Suspense>
  );
}
