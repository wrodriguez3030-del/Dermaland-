"use client";

import * as React from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from "@/components/ui";
import { ExportExcelButton } from "@/components/reporting/export-excel-button";
import { ExportPdfButton } from "@/components/reporting/export-pdf-button";
import { FileDown } from "lucide-react";
import { AGING_LABEL, AGING_ORDER } from "@/features/receivables/aging";
import { METHOD_LABEL, usePendingReceivables } from "@/features/receivables/components";
import { arApi, money, type ArSummary, type CollectionHistoryRow } from "@/features/receivables/receivables-client";
import type { WorkbookSpec } from "@/lib/reports/excel/types";
import type { ReportPdfSpec } from "@/lib/reports/pdf/types";

/**
 * Reportes de Cuentas por Cobrar: un Excel multihoja (motor central ExcelJS),
 * un PDF ejecutivo (motor pdfkit central) y CSV de facturas vencidas — siempre
 * con los datos reales del momento.
 */
export default function ReportesCxcPage() {
  const { rows, error, loading } = usePendingReceivables();
  const [history, setHistory] = React.useState<CollectionHistoryRow[]>([]);
  const [summary, setSummary] = React.useState<ArSummary | null>(null);

  React.useEffect(() => {
    arApi.history().then(setHistory).catch(() => {});
    arApi.summary().then(setSummary).catch(() => {});
  }, []);

  const pending = rows ?? [];
  const overdue = pending.filter((r) => r.overdueDays > 0);
  const nowLabel = new Date().toLocaleString("es-DO");

  const meta = {
    title: "Cuentas por Cobrar",
    subtitle: "Cartera, antigüedad, morosidad y cobranza",
    rangeLabel: "A la fecha",
    branchLabel: "Todas las sucursales",
    filtersLabel: "Sin filtros adicionales",
    generatedBy: "Sistema DermaLand",
    generatedAtLabel: nowLabel,
  };

  const excelSpec = (): WorkbookSpec => {
    const dayKey = (iso: string) => iso.slice(0, 10);
    const cobranzaPorDia = new Map<string, number>();
    for (const h of history) {
      cobranzaPorDia.set(dayKey(h.createdAt), Math.round(((cobranzaPorDia.get(dayKey(h.createdAt)) ?? 0) + h.amount) * 100) / 100);
    }
    const monthKey = (iso: string) => iso.slice(0, 7);
    const cobranzaPorMes = new Map<string, number>();
    for (const h of history) {
      cobranzaPorMes.set(monthKey(h.createdAt), Math.round(((cobranzaPorMes.get(monthKey(h.createdAt)) ?? 0) + h.amount) * 100) / 100);
    }
    const porGrupo = (key: (r: (typeof pending)[number]) => string) => {
      const m = new Map<string, { count: number; balance: number }>();
      for (const r of pending) {
        const k = key(r);
        const cur = m.get(k) ?? { count: 0, balance: 0 };
        cur.count += 1;
        cur.balance = Math.round((cur.balance + r.balance) * 100) / 100;
        m.set(k, cur);
      }
      return [...m.entries()].sort((a, b) => b[1].balance - a[1].balance);
    };
    const morosos = porGrupo((r) => r.customerName).filter(([name]) =>
      overdue.some((o) => o.customerName === name),
    );

    return {
      meta,
      sheets: [
        {
          name: "Pendientes",
          kpis: summary
            ? [
                { label: "Total por cobrar", value: summary.totalPendiente, format: "currency" },
                { label: "Facturas", value: summary.facturasPendientes, format: "int" },
                { label: "Vencido", value: summary.montoVencido, format: "currency" },
                { label: "Cobrado este mes", value: summary.cobradoMes, format: "currency" },
              ]
            : undefined,
          tables: [
            {
              title: "Facturas con saldo pendiente",
              autoFilter: true,
              columns: [
                { header: "Factura", key: "number" },
                { header: "e-CF", key: "ecf" },
                { header: "Cliente", key: "customer", width: 28 },
                { header: "Sucursal", key: "branch" },
                { header: "Vendedor", key: "seller" },
                { header: "Emisión", key: "issued", format: "date" },
                { header: "Vence", key: "due", format: "date" },
                { header: "Días vencidos", key: "overdue", format: "int" },
                { header: "Monto", key: "total", format: "currency" },
                { header: "Saldo", key: "balance", format: "currency" },
                { header: "Estado", key: "estado" },
              ],
              rows: pending.map((r) => ({
                number: r.number,
                ecf: r.ecfNumber ?? "",
                customer: r.customerName,
                branch: r.branchName,
                seller: r.sellerName ?? r.cashierName,
                issued: r.issuedAt,
                due: r.dueDate ?? "",
                overdue: r.overdueDays,
                total: r.total,
                balance: r.balance,
                estado: AGING_LABEL[r.bucket],
              })),
              totals: { customer: "TOTAL", balance: pending.reduce((s, r) => s + r.balance, 0) },
            },
          ],
        },
        {
          name: "Antigüedad",
          tables: [
            {
              title: "Antigüedad de saldos",
              columns: [
                { header: "Tramo", key: "tramo" },
                { header: "Facturas", key: "count", format: "int" },
                { header: "Monto", key: "amount", format: "currency" },
              ],
              rows: AGING_ORDER.map((b) => ({
                tramo: AGING_LABEL[b],
                count: summary?.aging.count[b] ?? 0,
                amount: summary?.aging.amount[b] ?? 0,
              })),
            },
          ],
        },
        {
          name: "Morosos",
          tables: [
            {
              title: "Clientes con facturas vencidas",
              autoFilter: true,
              columns: [
                { header: "Cliente", key: "cliente", width: 30 },
                { header: "Facturas pendientes", key: "count", format: "int" },
                { header: "Saldo", key: "balance", format: "currency" },
              ],
              rows: morosos.map(([cliente, v]) => ({ cliente, count: v.count, balance: v.balance })),
            },
          ],
        },
        {
          name: "Cobranza diaria",
          tables: [
            {
              title: "Cobros por día",
              columns: [
                { header: "Fecha", key: "fecha", format: "date" },
                { header: "Cobrado", key: "monto", format: "currency" },
              ],
              rows: [...cobranzaPorDia.entries()]
                .sort((a, b) => b[0].localeCompare(a[0]))
                .map(([fecha, monto]) => ({ fecha, monto })),
            },
          ],
        },
        {
          name: "Cobranza mensual",
          tables: [
            {
              title: "Cobros por mes",
              columns: [
                { header: "Mes", key: "mes" },
                { header: "Cobrado", key: "monto", format: "currency" },
              ],
              rows: [...cobranzaPorMes.entries()]
                .sort((a, b) => b[0].localeCompare(a[0]))
                .map(([mes, monto]) => ({ mes, monto })),
            },
          ],
        },
        {
          name: "Por sucursal",
          tables: [
            {
              title: "Saldo pendiente por sucursal",
              columns: [
                { header: "Sucursal", key: "k", width: 26 },
                { header: "Facturas", key: "count", format: "int" },
                { header: "Saldo", key: "balance", format: "currency" },
              ],
              rows: porGrupo((r) => r.branchName).map(([k, v]) => ({ k, count: v.count, balance: v.balance })),
            },
          ],
        },
        {
          name: "Por vendedor",
          tables: [
            {
              title: "Saldo pendiente por vendedor",
              columns: [
                { header: "Vendedor", key: "k", width: 26 },
                { header: "Facturas", key: "count", format: "int" },
                { header: "Saldo", key: "balance", format: "currency" },
              ],
              rows: porGrupo((r) => r.sellerName ?? r.cashierName).map(([k, v]) => ({ k, count: v.count, balance: v.balance })),
            },
          ],
        },
        {
          name: "Cobros",
          tables: [
            {
              title: "Historial de cobros (inmutable)",
              autoFilter: true,
              columns: [
                { header: "Fecha", key: "fecha", format: "datetime" },
                { header: "Factura", key: "number" },
                { header: "Cliente", key: "cliente", width: 28 },
                { header: "Método", key: "metodo" },
                { header: "Usuario", key: "usuario" },
                { header: "Saldo anterior", key: "antes", format: "currency" },
                { header: "Monto", key: "monto", format: "currency" },
                { header: "Saldo nuevo", key: "despues", format: "currency" },
              ],
              rows: history.map((h) => ({
                fecha: h.createdAt,
                number: h.number,
                cliente: h.customerName,
                metodo: METHOD_LABEL[h.method] ?? h.method,
                usuario: h.userName,
                antes: h.balanceBefore,
                monto: h.amount,
                despues: h.balanceAfter,
              })),
            },
          ],
        },
      ],
    };
  };

  const pdfSpec = (): ReportPdfSpec => ({
    meta: {
      title: "CUENTAS POR COBRAR",
      subtitle: "Cartera, antigüedad y morosidad",
      cutLabel: `Fecha de corte: ${new Date().toLocaleDateString("es-DO")}`,
      periodLabel: "A LA FECHA",
      branchLabel: "TODAS LAS SUCURSALES",
      businessName: "DERMALAND",
      filtersLabel: "Sin filtros adicionales",
      generatedBy: "Sistema DermaLand",
      generatedAtLabel: nowLabel,
      reportKind: "Reporte de cuentas por cobrar",
    },
    orientation: "auto",
    kpis: summary
      ? [
          { label: "Total por cobrar", value: summary.totalPendiente, format: "currency" },
          { label: "Vencido", value: summary.montoVencido, format: "currency", tone: summary.montoVencido > 0 ? "bad" : "good" },
          { label: "Clientes morosos", value: summary.clientesMorosos, format: "int" },
          { label: "Cobrado este mes", value: summary.cobradoMes, format: "currency", tone: "good" },
        ]
      : undefined,
    sections: [
      {
        title: "Facturas vencidas",
        table: {
          columns: [
            { header: "Factura", key: "number" },
            { header: "Cliente", key: "cliente", weight: 2 },
            { header: "Vence", key: "due", format: "date" },
            { header: "Días", key: "dias", format: "int", align: "right" },
            { header: "Saldo", key: "balance", format: "currency", align: "right" },
          ],
          rows: overdue.map((r) => ({
            number: r.number,
            cliente: r.customerName,
            due: r.dueDate,
            dias: r.overdueDays,
            balance: r.balance,
          })),
          totals: { cliente: "TOTAL", balance: overdue.reduce((s, r) => s + r.balance, 0) },
          emptyMessage: "Sin facturas vencidas.",
        },
      },
      {
        title: "Antigüedad de saldos",
        table: {
          columns: [
            { header: "Tramo", key: "tramo" },
            { header: "Facturas", key: "count", format: "int", align: "right" },
            { header: "Monto", key: "amount", format: "currency", align: "right" },
          ],
          rows: AGING_ORDER.map((b) => ({
            tramo: AGING_LABEL[b],
            count: summary?.aging.count[b] ?? 0,
            amount: summary?.aging.amount[b] ?? 0,
          })),
        },
      },
    ],
  });

  function downloadCsv() {
    const head = "Factura,e-CF,Cliente,Sucursal,Vendedor,Emision,Vence,DiasVencidos,Monto,Saldo,Estado";
    const esc = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = pending.map((r) =>
      [r.number, r.ecfNumber ?? "", r.customerName, r.branchName, r.sellerName ?? r.cashierName, r.issuedAt, r.dueDate ?? "", r.overdueDays, r.total, r.balance, AGING_LABEL[r.bucket]]
        .map(esc)
        .join(","),
    );
    const blob = new Blob(["﻿" + [head, ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Cuentas_Por_Cobrar_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <PageHeader
        title="Reportes de cuentas por cobrar"
        description="Cartera, antigüedad, morosidad y cobranza — exportables."
        breadcrumbs={[{ label: "Cuentas por cobrar" }, { label: "Reportes" }]}
      />

      {loading && <Skeleton className="h-40 rounded-xl" />}
      {error && <Card><CardContent className="py-6 text-sm text-rose-700">{error}</CardContent></Card>}

      {!loading && !error && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Excel ejecutivo</CardTitle>
              <CardDescription>
                8 hojas: pendientes, antigüedad, morosos, cobranza diaria/mensual, por sucursal, por
                vendedor y el historial de cobros.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ExportExcelButton getSpec={excelSpec} fileSlug="Cuentas_Por_Cobrar" label="Descargar Excel" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>PDF ejecutivo</CardTitle>
              <CardDescription>Resumen con KPIs, facturas vencidas y antigüedad, con identidad DermaLand.</CardDescription>
            </CardHeader>
            <CardContent>
              <ExportPdfButton getSpec={pdfSpec} fileSlug="Cuentas_Por_Cobrar" label="Descargar PDF" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>CSV</CardTitle>
              <CardDescription>Facturas pendientes en texto plano para importar en otra herramienta.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button size="sm" variant="outline" onClick={downloadCsv} disabled={pending.length === 0}>
                <FileDown className="h-4 w-4" /> Descargar CSV
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
