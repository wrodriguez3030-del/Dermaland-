"use client";

import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { RowActions } from "@/components/ui/row-actions";
import {
  Badge,
  Card,
  CardContent,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { StatCard } from "@/components/ui/stat-card";
import { Coins, Receipt, ShoppingCart, TrendingUp, Printer, Send, Trash2 } from "lucide-react";
import { mockProformas } from "@/lib/mock-data/sales";
import { mockBusiness } from "@/lib/mock-data/tenancy";
import { buildWhatsappShareUrl } from "@/features/sales/proforma-share";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";

export default function VentasPage() {
  const sales = mockProformas;
  const total = sales.reduce((s, p) => s + p.total, 0);
  const itbis = sales.reduce((s, p) => s + p.itbis, 0);
  const items = sales.reduce(
    (s, p) => s + p.items.reduce((q, i) => q + i.quantity, 0),
    0,
  );

  return (
    <>
      <PageHeader
        title="Ventas"
        description="Todas las ventas del día (proformas + facturas convertidas). Para detalle por venta usa proformas."
        breadcrumbs={[{ label: "Ventas" }]}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Ventas hoy" value={formatCurrency(total)} icon={Coins} tone="primary" />
        <StatCard label="ITBIS recaudado" value={formatCurrency(itbis)} icon={TrendingUp} />
        <StatCard label="Transacciones" value={sales.length} icon={Receipt} />
        <StatCard label="Items vendidos" value={items} icon={ShoppingCart} />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Hora</TH>
                <TH>Proforma</TH>
                <TH>Cliente</TH>
                <TH>Cajero</TH>
                <TH className="text-right">Total</TH>
                <TH>Estado</TH>
                <TH className="text-right pr-4">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {sales.map((p) => (
                <TR key={p.id}>
                  <TD className="text-xs">{formatDateTime(p.createdAt)}</TD>
                  <TD>
                    <Link href={`/proformas/${p.id}`} className="font-mono text-xs hover:text-[color:var(--brand-accent)]">
                      {p.number}
                    </Link>
                  </TD>
                  <TD className="text-sm">{p.customerName}</TD>
                  <TD className="text-sm opacity-70">{p.cashierName}</TD>
                  <TD className="text-right tabular-nums font-medium">
                    {formatCurrency(p.total)}
                  </TD>
                  <TD>
                    <Badge tone={p.status === "paid" ? "success" : p.status === "partially_paid" ? "warning" : "info"}>
                      {p.status}
                    </Badge>
                  </TD>
                  <TD className="pr-4">
                    <RowActions
                      viewHref={`/proformas/${p.id}`}
                      canEdit={false}
                      canDelete={false}
                      customActions={[
                        {
                          label: "Imprimir",
                          icon: Printer,
                          href: `/proformas/${p.id}/print`,
                        },
                        {
                          label: "Enviar WhatsApp",
                          icon: Send,
                          href: buildWhatsappShareUrl(p, mockBusiness),
                          external: true,
                        },
                        {
                          label: "Eliminar",
                          icon: Trash2,
                          disabled: true,
                          disabledReason:
                            "No se puede eliminar una venta emitida. Usa anular si aplica.",
                        },
                      ]}
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
