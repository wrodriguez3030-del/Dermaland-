"use client";

import * as React from "react";
import { Badge, Card, CardContent, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { formatCurrency } from "@/lib/utils/format";
import type { AlegraInvoiceRow } from "./sales-report";
import { METODO_ETIQUETA, totalesDeVentas } from "./sales-report";

const ESTADO: Record<AlegraInvoiceRow["status"], { label: string; tone: "success" | "warning" | "danger" | "neutral" }> =
  {
    closed: { label: "Pagada", tone: "success" },
    open: { label: "Con saldo", tone: "warning" },
    void: { label: "Anulada", tone: "danger" },
    draft: { label: "Borrador", tone: "neutral" },
  };

/**
 * Compras del cliente según Alegra. Es historial de OTRO sistema: no se mezcla
 * con las proformas ni con el POS, que tienen su propia pestaña.
 */
export function AlegraPurchasesTab({ clientId }: { clientId: string }) {
  const [invoices, setInvoices] = React.useState<AlegraInvoiceRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let vivo = true;
    setInvoices(null);
    setError(null);
    fetch(`/api/alegra/invoices?clientId=${encodeURIComponent(clientId)}`, { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json()) as { invoices?: AlegraInvoiceRow[]; error?: string };
        if (!vivo) return;
        if (!r.ok) {
          setError(j.error ?? "No se pudo cargar el historial de Alegra.");
          return;
        }
        setInvoices(j.invoices ?? []);
      })
      .catch(() => {
        if (vivo) setError("No se pudo contactar con el servidor.");
      });
    return () => {
      vivo = false;
    };
  }, [clientId]);

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-rose-700">{error}</CardContent>
      </Card>
    );
  }
  if (invoices === null) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm opacity-60">Cargando compras de Alegra…</CardContent>
      </Card>
    );
  }
  if (invoices.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm opacity-60">
          Este cliente no tiene facturas en Alegra.
        </CardContent>
      </Card>
    );
  }

  const t = totalesDeVentas(invoices);

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap gap-4 border-b px-4 py-3 text-sm">
          <span>
            <strong>{t.facturas}</strong> facturas
          </span>
          <span>
            Comprado <strong>{formatCurrency(t.total)}</strong>
          </span>
          {t.saldo > 0 && (
            <span className="text-amber-700">
              Pendiente <strong>{formatCurrency(t.saldo)}</strong>
            </span>
          )}
          {t.anuladas > 0 && <span className="opacity-60">{t.anuladas} anuladas</span>}
        </div>
        <Table>
          <THead>
            <TR>
              <TH>Fecha</TH>
              <TH>Comprobante</TH>
              <TH>Forma de pago</TH>
              <TH>Vendedor</TH>
              <TH className="text-right">Total</TH>
              <TH className="text-right">Saldo</TH>
              <TH className="pr-4">Estado</TH>
            </TR>
          </THead>
          <TBody>
            {invoices.map((f) => (
              <TR key={f.id}>
                <TD className="text-xs">{f.date}</TD>
                <TD className="font-mono text-xs">{f.ncf ?? "—"}</TD>
                <TD className="text-xs">
                  {METODO_ETIQUETA[f.paymentMethod ?? ""] ?? f.paymentMethod ?? "—"}
                </TD>
                <TD className="text-xs">{f.sellerName ?? "—"}</TD>
                <TD className="text-right tabular-nums font-medium">{formatCurrency(f.total)}</TD>
                <TD className="text-right tabular-nums">
                  {f.balance > 0 ? formatCurrency(f.balance) : "—"}
                </TD>
                <TD className="pr-4">
                  <Badge tone={ESTADO[f.status].tone}>{ESTADO[f.status].label}</Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}
