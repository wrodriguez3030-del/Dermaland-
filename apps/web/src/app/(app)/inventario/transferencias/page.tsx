"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Select,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { FilterBar } from "@/components/ui/filter-bar";
import { SearchInput } from "@/components/ui/search-input";
import { ArrowRightLeft, Plus, X } from "lucide-react";
import { RowActions } from "@/components/ui/row-actions";
import { formatDate } from "@/lib/utils/format";
import {
  useActiveBranches,
  resolveBranchName,
} from "@/features/tenancy/branch-store";
import {
  listTransfers,
  useTransfersTick,
} from "@/features/inventory/transfer-store";
import { matchesTransferSearch } from "@/features/inventory/transfer-search";
import { getProductById } from "@/lib/mock-data/catalog";

export default function TransferenciasPage() {
  useTransfersTick();
  const branches = useActiveBranches();
  const all = listTransfers();

  const [q, setQ] = React.useState("");
  const [origin, setOrigin] = React.useState("");
  const [destination, setDestination] = React.useState("");

  const hasFilters = q.trim() !== "" || origin !== "" || destination !== "";
  const clear = () => {
    setQ("");
    setOrigin("");
    setDestination("");
  };

  const filtered = all.filter((t) => {
    if (origin && t.originBranchId !== origin) return false;
    if (destination && t.destinationBranchId !== destination) return false;
    if (
      !matchesTransferSearch(t, q, (id) => {
        const p = getProductById(id);
        return p ? { name: p.name, barcode: p.barcode } : undefined;
      })
    )
      return false;
    return true;
  });

  return (
    <>
      <PageHeader
        title="Transferencias entre sucursales"
        description="Mueve stock entre sucursales de forma auditable."
        breadcrumbs={[
          { label: "Inventario", href: "/inventario" },
          { label: "Transferencias" },
        ]}
        actions={
          <Link href="/inventario/transferencias/nueva">
            <Button size="sm">
              <Plus className="h-4 w-4" /> Nueva transferencia
            </Button>
          </Link>
        }
      />

      {all.length > 0 && (
        <FilterBar className="mb-4">
          <SearchInput
            placeholder="Buscar por número, usuario, producto, código de barra o lote…"
            containerClassName="flex-1 min-w-[240px]"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Select value={origin} onChange={(e) => setOrigin(e.target.value)}>
            <option value="">Origen: todas</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
          <Select
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          >
            <option value="">Destino: todas</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clear}>
              <X className="h-4 w-4" /> Limpiar filtros
            </Button>
          )}
        </FilterBar>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Número</TH>
                <TH>Fecha</TH>
                <TH>Origen</TH>
                <TH>Destino</TH>
                <TH className="text-right">Unidades</TH>
                <TH>Usuario</TH>
                <TH>Estado</TH>
                <TH className="text-right pr-4">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.length === 0 && (
                <TR>
                  <TD colSpan={8}>
                    <div className="py-12 text-center">
                      <ArrowRightLeft className="mx-auto mb-2 h-8 w-8 opacity-30" />
                      <p className="text-sm font-medium">
                        {all.length === 0
                          ? "Aún no hay transferencias."
                          : "Ninguna transferencia coincide con los filtros."}
                      </p>
                      <p className="mt-1 text-xs opacity-60">
                        {all.length === 0
                          ? "Crea la primera con “Nueva transferencia”."
                          : "Ajusta o limpia los filtros."}
                      </p>
                      {all.length === 0 && (
                        <Link href="/inventario/transferencias/nueva">
                          <Button size="sm" className="mt-3">
                            <Plus className="h-4 w-4" /> Nueva transferencia
                          </Button>
                        </Link>
                      )}
                    </div>
                  </TD>
                </TR>
              )}
              {filtered.map((t) => (
                <TR key={t.id}>
                  <TD className="font-mono text-xs font-medium">
                    {t.transferNumber}
                  </TD>
                  <TD className="text-xs">{formatDate(t.transferDate)}</TD>
                  <TD className="text-xs">{resolveBranchName(t.originBranchId)}</TD>
                  <TD className="text-xs">
                    {resolveBranchName(t.destinationBranchId)}
                  </TD>
                  <TD className="text-right tabular-nums font-medium">
                    {t.totalQuantity}
                  </TD>
                  <TD className="text-xs">{t.createdByName}</TD>
                  <TD>
                    <Badge tone={t.status === "completed" ? "success" : "neutral"}>
                      {t.status === "completed" ? "Completada" : "Anulada"}
                    </Badge>
                  </TD>
                  <TD className="pr-4">
                    <RowActions
                      viewHref={`/inventario/transferencias/${t.id}`}
                      canEdit={false}
                      canDelete={false}
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
