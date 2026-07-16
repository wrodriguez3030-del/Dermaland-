"use client";

import * as React from "react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  Button,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { Megaphone } from "lucide-react";
import { useProducts } from "@/features/products/product-store";
import { useAllLots } from "@/features/inventory/lot-store";
import { formatDate } from "@/lib/utils/format";
import { lotStatusBadge } from "@/features/inventory/lot-badges";

export default function RecallPage() {
  // Lotes REALES (Supabase o local según DATA_SOURCE); el estado `recalled`
  // se cambia en runtime desde Cuarentena — antes se leía el seed estático
  // y la lista salía vacía en producción.
  const allLots = useAllLots();
  const lots = allLots.filter((l) => l.status === "recalled");
  const products = useProducts();
  const productById = React.useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );
  return (
    <>
      <PageHeader
        title="Recall / retiro de lote"
        description="Marcar lote como retirado del mercado. Bloquea venta y permite contactar clientes que lo compraron."
        breadcrumbs={[
          { label: "Inventario", href: "/inventario" },
          { label: "Recall" },
        ]}
        actions={
          <Button size="sm" variant="danger">
            <Megaphone className="h-4 w-4" />
            Iniciar recall
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Producto</TH>
                <TH>Lote</TH>
                <TH className="text-right">Stock al recall</TH>
                <TH>Vence</TH>
                <TH>Razón</TH>
                <TH>Estado</TH>
                <TH className="text-right pr-4">Acción</TH>
              </TR>
            </THead>
            <TBody>
              {lots.length === 0 && (
                <TR>
                  <TD colSpan={7} className="py-8 text-center text-sm opacity-60">
                    Sin lotes en recall.
                  </TD>
                </TR>
              )}
              {lots.map((lot) => {
                const p = productById.get(lot.productId);
                return (
                  <TR key={lot.id}>
                    <TD>
                      <div className="text-sm">{p?.name}</div>
                      <div className="font-mono text-xs opacity-60">{p?.sku}</div>
                    </TD>
                    <TD className="font-mono text-xs">{lot.lotNumber}</TD>
                    <TD className="text-right tabular-nums">
                      {lot.currentQuantity}
                    </TD>
                    <TD className="text-xs">{formatDate(lot.expiresAt)}</TD>
                    <TD className="text-xs opacity-80">{lot.notes ?? "—"}</TD>
                    <TD>{lotStatusBadge(lot.status)}</TD>
                    <TD className="text-right pr-4">
                      <button className="text-xs font-medium text-[color:var(--brand-accent)] hover:underline">
                        Notificar clientes
                      </button>
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
