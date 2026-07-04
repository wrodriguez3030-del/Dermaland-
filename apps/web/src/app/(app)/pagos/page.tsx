"use client";

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
import {
  SortableTH,
  useTableSort,
} from "@/components/ui/sortable-table-header";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import { Printer, Send } from "lucide-react";
import { mockBusiness } from "@/lib/mock-data/tenancy";
import { useProformas } from "@/features/sales/proforma-store";
import { buildWhatsappShareUrl } from "@/features/sales/proforma-share";
import { documentRouteBase } from "@/features/sales/document-label";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";
import type { Proforma } from "@/types";

interface PaymentRow {
  id: string;
  proformaId: string;
  proformaNumber: string;
  customerName: string;
  method: string;
  amount: number;
  reference?: string;
  last4?: string;
  userId: string;
  userName: string;
  createdAt: string;
  /** Ruta base del documento (/ventas para facturas, /proformas si no). */
  routeBase: string;
  /** Documento origen para compartir por WhatsApp. */
  proforma: Proforma;
}

const comparators = {
  date: (a: PaymentRow, b: PaymentRow) =>
    +new Date(a.createdAt) - +new Date(b.createdAt),
  customer: (a: PaymentRow, b: PaymentRow) =>
    a.customerName.localeCompare(b.customerName),
  method: (a: PaymentRow, b: PaymentRow) => a.method.localeCompare(b.method),
  amount: (a: PaymentRow, b: PaymentRow) => a.amount - b.amount,
};

export default function PagosPage() {
  // Ventas REALES (Supabase o local según DATA_SOURCE); antes se leía el seed
  // estático `mockProformas` y los pagos reales del POS no aparecían.
  const proformas = useProformas();
  const payments: PaymentRow[] = proformas.flatMap((p) =>
    (p.payments ?? []).map((pay) => ({
      ...pay,
      proformaNumber: p.number,
      customerName: p.customerName,
      routeBase: documentRouteBase(p),
      proforma: p,
    })),
  );

  const { sort, sorted, toggle } = useTableSort(
    payments,
    "date",
    "desc",
    comparators,
  );
  const pag = usePagination(sorted);

  return (
    <>
      <PageHeader
        title="Pagos"
        description="Pagos recibidos. Conectados a proformas y caja activa."
        breadcrumbs={[{ label: "Ventas" }, { label: "Pagos" }]}
      />
      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <SortableTH sortKey="date" state={sort} onClick={toggle}>
                  Fecha
                </SortableTH>
                <TH>Proforma</TH>
                <SortableTH sortKey="customer" state={sort} onClick={toggle}>
                  Cliente
                </SortableTH>
                <SortableTH sortKey="method" state={sort} onClick={toggle}>
                  Método
                </SortableTH>
                <SortableTH
                  sortKey="amount"
                  state={sort}
                  onClick={toggle}
                  align="right"
                >
                  Monto
                </SortableTH>
                <TH>Referencia</TH>
                <TH>Cajero</TH>
                <TH className="text-right pr-4">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {payments.length === 0 && (
                <TR>
                  <TD colSpan={8} className="py-8 text-center text-sm opacity-60">
                    Aún no hay pagos registrados.
                  </TD>
                </TR>
              )}
              {pag.pageItems.map((p) => (
                <TR key={p.id}>
                  <TD className="text-xs whitespace-nowrap">
                    {formatDateTime(p.createdAt)}
                  </TD>
                  <TD className="font-mono text-xs">{p.proformaNumber}</TD>
                  <TD className="text-sm">{p.customerName}</TD>
                  <TD>
                    <Badge tone="info">{p.method}</Badge>
                  </TD>
                  <TD className="text-right tabular-nums font-medium">
                    {formatCurrency(p.amount)}
                  </TD>
                  <TD className="text-xs font-mono">
                    {p.last4
                      ? `····${p.last4}`
                      : p.reference ?? "—"}
                  </TD>
                  <TD className="text-xs">{p.userName}</TD>
                  <TD className="pr-4">
                    <RowActions
                      viewHref={`${p.routeBase}/${p.proformaId}`}
                      canEdit={false}
                      canDelete={false}
                      customActions={[
                        {
                          label: "Imprimir recibo",
                          icon: Printer,
                          href: `${p.routeBase}/${p.proformaId}/imprimir`,
                        },
                        {
                          label: "Enviar recibo por WhatsApp",
                          icon: Send,
                          href: buildWhatsappShareUrl(p.proforma, mockBusiness),
                          external: true,
                        },
                      ]}
                    />
                  </TD>
                </TR>
              ))}
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
    </>
  );
}
