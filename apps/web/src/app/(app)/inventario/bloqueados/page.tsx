"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { RowActions } from "@/components/ui/row-actions";
import { ShieldAlert, ShieldCheck, Megaphone } from "lucide-react";
import { useProducts } from "@/features/products/product-store";
import { useAllLots } from "@/features/inventory/lot-store";
import { BranchFilter, branchMatches, ALL_BRANCHES } from "@/features/tenancy/branch-filter";
import { blockedLots } from "@/features/inventory/lot-selectors";
import { getBranchDisplayName } from "@/features/tenancy/branch-store";
import { lotStatusBadge } from "@/features/inventory/lot-badges";
import { formatDate, daysUntil } from "@/lib/utils/format";

type Tab = "todos" | "cuarentena" | "recall";
const TABS: readonly Tab[] = ["todos", "cuarentena", "recall"];

const tabLabel: Record<Tab, string> = {
  todos: "Todos",
  cuarentena: "Cuarentena",
  recall: "Recall",
};

function BloqueadosContent() {
  const params = useSearchParams();
  const initialTab = (() => {
    const t = params.get("tab");
    return t && TABS.includes(t as Tab) ? (t as Tab) : "todos";
  })();
  const [tab, setTab] = React.useState<Tab>(initialTab);
  const [branchFilter, setBranchFilter] = React.useState(ALL_BRANCHES);

  const allLots = useAllLots();
  const products = useProducts();
  const productById = React.useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  // Fuente ÚNICA: mismos lotes bloqueados (cuarentena + recall) que cuenta el
  // KPI "Lotes bloqueados" del dashboard → el total de "Todos" coincide.
  const blocked = React.useMemo(() => blockedLots(allLots), [allLots]);
  const quarantine = React.useMemo(
    () => blocked.filter((l) => l.status === "quarantine"),
    [blocked],
  );
  const recalled = React.useMemo(
    () => blocked.filter((l) => l.status === "recalled"),
    [blocked],
  );

  const rows = (
    tab === "cuarentena" ? quarantine : tab === "recall" ? recalled : blocked
  ).filter((l) => branchMatches(l.branchId, branchFilter));

  const counts: Record<Tab, number> = {
    todos: blocked.length,
    cuarentena: quarantine.length,
    recall: recalled.length,
  };

  return (
    <>
      <PageHeader
        title="Lotes bloqueados"
        description="Lotes retenidos para venta por control de calidad: cuarentena y recall. El POS no los deja vender."
        breadcrumbs={[
          { label: "Inventario", href: "/inventario" },
          { label: "Bloqueados" },
        ]}
      />

      {/* Tabs: Todos / Cuarentena / Recall */}
      <div
        className="mb-4 inline-flex rounded-xl border border-black/10 bg-white p-1"
        role="tablist"
        aria-label="Filtrar lotes bloqueados"
      >
        {TABS.map((t) => {
          const active = tab === t;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                active
                  ? "bg-[color:var(--brand-primary)] text-white"
                  : "text-black/60 hover:bg-black/[0.04]"
              }`}
            >
              {tabLabel[t]}
              <span
                className={`ml-1.5 tabular-nums ${active ? "opacity-90" : "opacity-50"}`}
              >
                {counts[t]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <BranchFilter value={branchFilter} onChange={setBranchFilter} />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Producto</TH>
                <TH>Lote</TH>
                <TH>Sucursal</TH>
                <TH className="text-right">Cantidad</TH>
                <TH>Vence</TH>
                <TH>Estado</TH>
                <TH>Motivo</TH>
                <TH className="text-right pr-4">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {rows.length === 0 && (
                <TR>
                  <TD colSpan={8} className="py-10 text-center text-sm opacity-60">
                    {tab === "todos"
                      ? "No hay lotes bloqueados."
                      : `No hay lotes en ${tabLabel[tab].toLowerCase()}.`}
                  </TD>
                </TR>
              )}
              {rows.map((lot) => {
                const p = productById.get(lot.productId);
                const days = daysUntil(lot.expiresAt);
                return (
                  <TR key={lot.id}>
                    <TD>
                      <div className="text-sm">{p?.name ?? "Producto no encontrado"}</div>
                      <div className="font-mono text-xs opacity-60">{p?.sku}</div>
                    </TD>
                    <TD className="font-mono text-xs">{lot.lotNumber}</TD>
                    <TD className="text-xs opacity-70">
                      {getBranchDisplayName(lot.branchId)}
                    </TD>
                    <TD className="text-right tabular-nums">{lot.currentQuantity}</TD>
                    <TD className="text-xs">
                      {formatDate(lot.expiresAt)}
                      <span className="ml-1 opacity-50">
                        ({days < 0 ? `${Math.abs(days)} d. vencido` : `${days} d.`})
                      </span>
                    </TD>
                    <TD>{lotStatusBadge(lot.status)}</TD>
                    <TD className="max-w-[220px] truncate text-xs opacity-80">
                      {lot.notes ?? "—"}
                    </TD>
                    <TD className="pr-4">
                      <RowActions
                        viewHref={`/productos/${lot.productId}`}
                        canEdit={false}
                        canDelete={false}
                        customActions={[
                          lot.status === "quarantine"
                            ? {
                                label: "Gestionar en Cuarentena",
                                icon: ShieldCheck,
                                href: "/inventario/cuarentena",
                              }
                            : {
                                label: "Gestionar en Recall",
                                icon: Megaphone,
                                href: "/inventario/recall",
                              },
                        ]}
                      />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <div className="mt-4 flex flex-wrap gap-3 text-xs">
        <Link
          href="/inventario/cuarentena"
          className="inline-flex items-center gap-1 font-medium text-[color:var(--brand-accent)] hover:underline"
        >
          <ShieldAlert className="h-3.5 w-3.5" /> Ir a Cuarentena
        </Link>
        <Link
          href="/inventario/recall"
          className="inline-flex items-center gap-1 font-medium text-[color:var(--brand-accent)] hover:underline"
        >
          <Megaphone className="h-3.5 w-3.5" /> Ir a Recall
        </Link>
      </div>
    </>
  );
}

export default function BloqueadosPage() {
  return (
    <React.Suspense
      fallback={<div className="p-6 text-sm opacity-60">Cargando lotes bloqueados…</div>}
    >
      <BloqueadosContent />
    </React.Suspense>
  );
}
