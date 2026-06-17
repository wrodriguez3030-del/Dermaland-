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
import { ArrowRightLeft, Eye, Plus, X } from "lucide-react";
import { mockWarehouses, getWarehouseById, getBranchById } from "@/lib/mock-data/tenancy";
import { formatDate } from "@/lib/utils/format";
import {
  listTransfers,
  useTransfersTick,
} from "@/features/inventory/transfer-store";

const whLabel = (id: string) => {
  const w = getWarehouseById(id);
  return w ? `${w.name} · ${getBranchById(w.branchId)?.name ?? ""}` : id;
};

export default function TransferenciasPage() {
  useTransfersTick();
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
    if (origin && t.originWarehouseId !== origin) return false;
    if (destination && t.destinationWarehouseId !== destination) return false;
    if (q.trim()) {
      const term = q.trim().toLowerCase();
      const hay =
        t.transferNumber.toLowerCase().includes(term) ||
        t.createdByName.toLowerCase().includes(term) ||
        t.items.some(
          (i) =>
            i.lotNumber.toLowerCase().includes(term) ||
            i.productId.toLowerCase().includes(term),
        );
      if (!hay) return false;
    }
    return true;
  });

  return (
    <>
      <PageHeader
        title="Transferencias entre almacenes"
        description="Mueve stock entre almacenes y sucursales de forma auditable."
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

      <FilterBar className="mb-4">
        <SearchInput
          placeholder="Buscar por número, usuario, lote o producto…"
          containerClassName="flex-1 min-w-[240px]"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select value={origin} onChange={(e) => setOrigin(e.target.value)}>
          <option value="">Origen: todos</option>
          {mockWarehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>
        <Select
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
        >
          <option value="">Destino: todos</option>
          {mockWarehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clear}>
            <X className="h-4 w-4" /> Limpiar filtros
          </Button>
        )}
      </FilterBar>

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
                  <TD className="text-xs">{whLabel(t.originWarehouseId)}</TD>
                  <TD className="text-xs">{whLabel(t.destinationWarehouseId)}</TD>
                  <TD className="text-right tabular-nums font-medium">
                    {t.totalQuantity}
                  </TD>
                  <TD className="text-xs">{t.createdByName}</TD>
                  <TD>
                    <Badge tone={t.status === "completed" ? "success" : "neutral"}>
                      {t.status === "completed" ? "Completada" : "Anulada"}
                    </Badge>
                  </TD>
                  <TD className="pr-4 text-right">
                    <Link href={`/inventario/transferencias/${t.id}`}>
                      <Button variant="ghost" size="sm" aria-label="Ver" title="Ver">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </Link>
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
