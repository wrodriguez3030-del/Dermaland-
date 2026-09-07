"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button, Card, CardContent, Skeleton, Table, THead, TBody, TR, TH, TD } from "@/components/ui";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Phone, Mail, MessageCircle, HandCoins, CalendarClock, Users, AlertTriangle } from "lucide-react";
import { contactLinks, CollectModal, PromiseModal, usePendingReceivables } from "@/features/receivables/components";
import { EtiquetaOrigen } from "@/features/ventas/etiqueta-origen";
import { money, type ReceivableRow } from "@/features/receivables/receivables-client";

interface MoraRow {
  clientId: string | null;
  name: string;
  phone: string | null;
  invoices: ReceivableRow[];
  overdueAmount: number;
  maxOverdueDays: number;
}

/** Clientes con facturas vencidas — vista de gestión de cobranza. */
export default function MoraPage() {
  const { rows, error, loading, reload } = usePendingReceivables();
  const [collectFor, setCollectFor] = React.useState<ReceivableRow[]>([]);
  const [promiseFor, setPromiseFor] = React.useState<MoraRow | null>(null);

  const overdue = (rows ?? []).filter((r) => r.overdueDays > 0);
  const byClient = new Map<string, MoraRow>();
  for (const r of overdue) {
    const key = r.customerId ?? r.customerName;
    const cur = byClient.get(key) ?? {
      clientId: r.customerId,
      name: r.customerName,
      phone: r.customerPhone,
      invoices: [],
      overdueAmount: 0,
      maxOverdueDays: 0,
    };
    cur.invoices.push(r);
    cur.overdueAmount = Math.round((cur.overdueAmount + r.balance) * 100) / 100;
    cur.maxOverdueDays = Math.max(cur.maxOverdueDays, r.overdueDays);
    if (!cur.phone && r.customerPhone) cur.phone = r.customerPhone;
    byClient.set(key, cur);
  }
  const morosos = [...byClient.values()].sort((a, b) => b.overdueAmount - a.overdueAmount);
  const totalMora = morosos.reduce((s, m) => s + m.overdueAmount, 0);

  return (
    <>
      <PageHeader
        title="Clientes con mora"
        description="Facturas vencidas agrupadas por cliente, con acciones de contacto."
        breadcrumbs={[{ label: "Cuentas por cobrar" }, { label: "Clientes con mora" }]}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatCard label="Monto en mora" value={money(totalMora)} icon={AlertTriangle} tone={totalMora > 0 ? "danger" : "default"} />
        <StatCard label="Clientes morosos" value={morosos.length} icon={Users} tone={morosos.length > 0 ? "warning" : "default"} />
      </div>

      {loading && <Skeleton className="h-64 rounded-xl" />}
      {error && <Card><CardContent className="py-6 text-sm text-rose-700">{error}</CardContent></Card>}

      {!loading && !error && (morosos.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Sin clientes en mora"
          description="Ningún cliente tiene facturas vencidas. 🎉"
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Cliente</TH>
                    <TH>Teléfono</TH>
                    <TH className="text-right">Monto vencido</TH>
                    <TH className="text-right">Facturas</TH>
                    <TH className="text-right">Días de atraso</TH>
                    <TH className="pr-4 text-right">Acciones</TH>
                  </TR>
                </THead>
                <TBody>
                  {morosos.map((m) => {
                    const msg = `Hola ${m.name}, le recordamos de DermaLand que tiene un saldo vencido de ${money(m.overdueAmount)} (${m.invoices.length} factura(s)). ¿Coordinamos el pago?`;
                    const links = contactLinks(m.phone, null, msg);
                    return (
                      <TR key={m.clientId ?? m.name}>
                        <TD className="text-sm font-medium">
                          <span className="inline-flex flex-wrap items-center gap-1.5">
                            {m.clientId ? (
                              <Link className="hover:underline" href={`/cuentas-por-cobrar/estados-de-cuenta?cliente=${m.clientId}`}>
                                {m.name}
                              </Link>
                            ) : (
                              m.name
                            )}
                            {/* La deuda de este cliente puede ser 100 % del
                                sistema anterior. Sin marca, la encargada lo
                                llama a cobrar algo que se paga en Alegra. */}
                            {m.invoices.some((i) => i.origen === "alegra") && (
                              <EtiquetaOrigen origen="alegra" />
                            )}
                          </span>
                        </TD>
                        <TD className="text-xs opacity-70">{m.phone ?? "—"}</TD>
                        <TD className="text-right font-semibold tabular-nums text-rose-700">{money(m.overdueAmount)}</TD>
                        <TD className="text-right tabular-nums">{m.invoices.length}</TD>
                        <TD className="text-right tabular-nums">{m.maxOverdueDays}</TD>
                        <TD className="pr-4">
                          <div className="flex justify-end gap-1.5">
                            {links.tel && (
                              <a href={links.tel} title="Llamar">
                                <Button size="sm" variant="outline"><Phone className="h-3.5 w-3.5" /></Button>
                              </a>
                            )}
                            {links.whatsapp && (
                              <a href={links.whatsapp} target="_blank" rel="noreferrer" title="WhatsApp">
                                <Button size="sm" variant="outline"><MessageCircle className="h-3.5 w-3.5" /></Button>
                              </a>
                            )}
                            {links.mailto && (
                              <a href={links.mailto} title="Correo">
                                <Button size="sm" variant="outline"><Mail className="h-3.5 w-3.5" /></Button>
                              </a>
                            )}
                            <Button size="sm" variant="outline" title="Registrar promesa" onClick={() => setPromiseFor(m)}>
                              <CalendarClock className="h-3.5 w-3.5" />
                            </Button>
                            {/* Solo las cobrables: si toda la mora de este
                                cliente es histórico de Alegra, el botón se
                                apaga y dice por qué. */}
                            <Button
                              size="sm"
                              title={
                                m.invoices.some((i) => i.cobrable)
                                  ? "Registrar pago"
                                  : "Toda la mora de este cliente son facturas migradas de Alegra: se cobran en Alegra, no aquí."
                              }
                              disabled={!m.invoices.some((i) => i.cobrable)}
                              onClick={() => setCollectFor(m.invoices.filter((i) => i.cobrable))}
                            >
                              <HandCoins className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ))}

      <CollectModal
        open={collectFor.length > 0}
        onClose={() => setCollectFor([])}
        invoices={collectFor}
        onDone={reload}
      />
      {promiseFor && (
        <PromiseModal
          open={!!promiseFor}
          onClose={() => setPromiseFor(null)}
          clientId={promiseFor.clientId}
          clientName={promiseFor.name}
          suggestedAmount={promiseFor.overdueAmount}
          onDone={reload}
        />
      )}
    </>
  );
}
