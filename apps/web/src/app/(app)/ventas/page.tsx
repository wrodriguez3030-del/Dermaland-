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
import { useToast } from "@/components/ui/toast";
import { Coins, Receipt, ShoppingCart, TrendingUp, Printer, Send, Trash2, Pencil } from "lucide-react";
import { useProformas } from "@/features/sales/proforma-store";
import { shareProformaWhatsapp } from "@/features/sales/whatsapp-share.client";
import {
  isInvoiceDocument,
  saleDocumentLabel,
  saleDocumentTone,
} from "@/features/sales/document-label";
import { documentEditability } from "@/features/sales/editability";
import { canEditSales } from "@/features/billing/permissions";
import { mockCurrentUser } from "@/lib/mock-data/users";
import type { Proforma } from "@/types";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";

export default function VentasPage() {
  // Ventas / Facturas: documentos fiscales emitidos (NCF B02/B01 y e-CF E32/E31).
  // Las proformas pendientes viven en la pantalla Proformas.
  const toast = useToast();
  const allDocuments = useProformas();
  const sales = allDocuments.filter(isInvoiceDocument);
  const canEdit = canEditSales(mockCurrentUser.role);

  const handleShareWhatsapp = async (p: Proforma) => {
    const r = await shareProformaWhatsapp(p);
    if (r.ok) toast.show("Abriendo WhatsApp con la factura en PDF…", "info");
    else toast.error(r.error);
  };
  const total = sales.reduce((s, p) => s + p.total, 0);
  const itbis = sales.reduce((s, p) => s + p.itbis, 0);
  const items = sales.reduce(
    (s, p) => s + p.items.reduce((q, i) => q + i.quantity, 0),
    0,
  );

  return (
    <>
      <PageHeader
        title="Ventas / Facturas"
        description="Facturas emitidas (NCF B02/B01 y e-CF E32/E31). Las proformas pendientes están en la pantalla Proformas."
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
                <TH>Comprobante</TH>
                <TH>Documento</TH>
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
                    <Link href={`/ventas/${p.id}`} className="font-mono text-xs hover:text-[color:var(--brand-accent)]">
                      {p.ecfNumber ?? p.number}
                    </Link>
                  </TD>
                  <TD>
                    <Badge tone={saleDocumentTone(p)}>{saleDocumentLabel(p)}</Badge>
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
                      viewHref={`/ventas/${p.id}`}
                      canEdit={false}
                      canDelete={false}
                      customActions={[
                        {
                          label: "Editar factura",
                          icon: Pencil,
                          ...(canEdit && documentEditability(p).editable
                            ? { href: `/ventas/${p.id}/editar` }
                            : {
                                disabled: true,
                                disabledReason: !canEdit
                                  ? "No tienes permiso para editar facturas."
                                  : documentEditability(p).reason ??
                                    "Este documento no se puede editar.",
                              }),
                        },
                        {
                          label: "Imprimir",
                          icon: Printer,
                          href: `/ventas/${p.id}/print`,
                        },
                        {
                          label: "Enviar WhatsApp",
                          icon: Send,
                          onClick: () => handleShareWhatsapp(p),
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
      <toast.Toast />
    </>
  );
}
