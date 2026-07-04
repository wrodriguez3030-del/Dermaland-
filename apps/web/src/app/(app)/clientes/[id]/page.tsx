"use client";

import Link from "next/link";
import * as React from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  AtSign,
  CalendarRange,
  CreditCard,
  Droplets,
  FileText,
  HeartPulse,
  Mail,
  MapPin,
  MessageSquare,
  Pencil,
  Phone,
  Pin,
  ShoppingCart,
  Tag,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { StatCard } from "@/components/ui/stat-card";
import { useCustomer } from "@/features/customers/customer-store";
import { getCustomerNotes } from "@/lib/mock-data/customers";
import { useProformas } from "@/features/sales/proforma-store";
import {
  purchasesForCustomer,
  computeCustomerPurchaseStats,
} from "@/features/customers/customer-purchases";
import {
  comprobanteLabel,
} from "@/features/sales/sales-report";
import { documentRouteBase } from "@/features/sales/document-label";
import { SendInvoiceModal } from "@/features/sales/components/send-invoice-modal";
import { mockRecommendations } from "@/lib/mock-data/dermatology";
import type { Proforma } from "@/types";
import {
  billingTypeEcf,
  billingTypeLabel,
  skinTypeLabel,
} from "@/features/customers/billing";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  relativeTime,
} from "@/lib/utils/format";

const SALE_STATUS_BADGE: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  paid: { label: "Pagada", tone: "success" },
  partially_paid: { label: "Pago parcial", tone: "warning" },
  issued: { label: "Emitida", tone: "warning" },
  pending: { label: "Pendiente", tone: "warning" },
  draft: { label: "Proforma", tone: "neutral" },
  cancelled: { label: "Anulada", tone: "danger" },
  expired: { label: "Vencida", tone: "danger" },
};

export default function ClienteDetallePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const c = useCustomer(id);
  // Ventas REALES (Supabase o local segun DATA_SOURCE) — antes se filtraba
  // el seed estatico mockProformas y el perfil salia vacio en produccion.
  const allSales = useProformas();
  const [sendModal, setSendModal] = React.useState<{
    proforma: Proforma | null;
    tab: "whatsapp" | "email";
  }>({ proforma: null, tab: "whatsapp" });

  if (!c) {
    return (
      <>
        <PageHeader
          title="Cliente no encontrado"
          breadcrumbs={[
            { label: "Clientes", href: "/clientes" },
            { label: id },
          ]}
        />
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm opacity-70">
              No encontramos el cliente con id <code>{id}</code>. Puede haberse
              creado en otro navegador o haber sido eliminado.
            </p>
            <Link
              href="/clientes"
              className="mt-4 inline-block text-sm text-[color:var(--brand-accent)] hover:underline"
            >
              ← Volver al listado
            </Link>
          </CardContent>
        </Card>
      </>
    );
  }

  const notes = getCustomerNotes(c.id);
  // customer_id primero; fallback seguro por documento/telefono normalizados
  // (para ventas viejas sin id — un walk-in sin datos nunca se mezcla).
  const proformas = purchasesForCustomer(allSales, c);
  const stats = computeCustomerPurchaseStats(proformas);
  const recommendations = mockRecommendations.filter(
    (r) => r.customerId === c.id,
  );

  return (
    <>
      <Link
        href="/clientes"
        className="mb-4 inline-flex items-center gap-1 text-xs opacity-60 hover:opacity-100"
      >
        <ArrowLeft className="h-3 w-3" /> Volver a clientes
      </Link>

      <PageHeader
        title={`${c.firstName} ${c.lastName}`}
        description={`${c.customerNumber}${c.documentType ? ` · ${c.documentType}` : ""}${c.documentNumber ? ` ${c.documentNumber}` : ""}`}
        breadcrumbs={[
          { label: "Clientes", href: "/clientes" },
          { label: c.customerNumber },
        ]}
        actions={
          <>
            <Link href={`/clientes/${c.id}/editar`}>
              <Button variant="outline" size="sm">
                <Pencil className="h-4 w-4" />
                Editar cliente
              </Button>
            </Link>
            <Button variant="outline" size="sm">
              <MessageSquare className="h-4 w-4" />
              Enviar WhatsApp
            </Button>
            <Link href="/recomendaciones/nueva">
              <Button size="sm">
                <HeartPulse className="h-4 w-4" />
                Nueva recomendación
              </Button>
            </Link>
          </>
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-4">
        <StatCard
          label="Total gastado"
          value={formatCurrency(stats.totalSpent)}
          icon={CreditCard}
          tone="primary"
        />
        <StatCard label="Compras" value={stats.purchases} icon={ShoppingCart} />
        <StatCard
          label="Última visita"
          value={stats.lastVisitAt ? relativeTime(stats.lastVisitAt) : "—"}
          icon={CalendarRange}
        />
        <StatCard
          label="Recomendaciones"
          value={recommendations.length}
          icon={HeartPulse}
        />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Datos personales</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2 text-sm">
              <DataRow icon={Phone} label="Teléfono" value={c.phone ?? "—"} />
              <DataRow icon={MessageSquare} label="WhatsApp" value={c.whatsapp ?? "—"} />
              <DataRow icon={Mail} label="Email" value={c.email ?? "—"} />
              <DataRow
                icon={CalendarRange}
                label="Fecha de nacimiento"
                value={c.birthDate ? formatDate(c.birthDate) : "—"}
              />
              <DataRow
                icon={MapPin}
                label="Dirección"
                value={`${c.address ?? ""} ${c.city ?? ""}`.trim() || "—"}
              />
              <DataRow icon={AtSign} label="Fuente" value={c.source} />
              <DataRow
                icon={FileText}
                label="Tipo de facturación"
                value={`${billingTypeLabel(c.defaultBillingType)} · ${billingTypeEcf(c.defaultBillingType)}`}
              />
              <DataRow
                icon={Droplets}
                label="Tipo de piel"
                value={skinTypeLabel(c.skinType)}
              />
            </dl>
            {c.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {c.tags.map((t) => (
                  <Badge key={t} tone="info" outlined>
                    <Tag className="h-3 w-3" />
                    {t}
                  </Badge>
                ))}
              </div>
            )}
            {c.notes && (
              <div className="mt-4 rounded-lg bg-black/[0.02] p-3 text-sm">
                <div className="text-xs font-medium opacity-60">Notas internas</div>
                <p className="mt-1 whitespace-pre-line">{c.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notas pinneadas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {notes.filter((n) => n.pinned).length === 0 && (
              <p className="text-sm opacity-60">Sin notas pinneadas.</p>
            )}
            {notes
              .filter((n) => n.pinned)
              .map((n) => (
                <div
                  key={n.id}
                  className="rounded-lg bg-amber-50 border border-amber-200 p-3"
                >
                  <div className="flex items-center gap-2 text-xs text-amber-900">
                    <Pin className="h-3 w-3" />
                    {n.authorName}
                    <span className="opacity-60">·</span>
                    {relativeTime(n.createdAt)}
                  </div>
                  <p className="mt-1 text-sm">{n.body}</p>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="purchases">
        <TabsList>
          <TabsTrigger value="purchases">
            Compras ({proformas.length})
          </TabsTrigger>
          <TabsTrigger value="recommendations">
            Recomendaciones ({recommendations.length})
          </TabsTrigger>
          <TabsTrigger value="notes">Notas ({notes.length})</TabsTrigger>
          <TabsTrigger value="conversations">Conversaciones</TabsTrigger>
        </TabsList>

        <TabsContent value="purchases">
          <Card>
            <CardContent className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Fecha</TH>
                    <TH>Comprobante</TH>
                    <TH>Tipo</TH>
                    <TH className="text-right">Items</TH>
                    <TH className="text-right">Total</TH>
                    <TH>Estado</TH>
                    <TH className="text-right pr-4">Acciones</TH>
                  </TR>
                </THead>
                <TBody>
                  {proformas.length === 0 && (
                    <TR>
                      <TD colSpan={7} className="py-8 text-center text-sm opacity-60">
                        Este cliente aún no tiene compras registradas.
                      </TD>
                    </TR>
                  )}
                  {proformas.map((p) => (
                    <TR key={p.id}>
                      <TD className="text-xs">{formatDateTime(p.createdAt)}</TD>
                      <TD className="font-mono text-xs">{p.number}</TD>
                      <TD className="text-xs">{comprobanteLabel(p)}</TD>
                      <TD className="text-right tabular-nums">{p.items.length}</TD>
                      <TD className="text-right tabular-nums font-medium">
                        {formatCurrency(p.total)}
                      </TD>
                      <TD>
                        <Badge tone={(SALE_STATUS_BADGE[p.status] ?? { tone: "neutral" as const }).tone}>
                          {(SALE_STATUS_BADGE[p.status] ?? { label: p.status }).label}
                        </Badge>
                      </TD>
                      <TD className="pr-4">
                        <div className="flex items-center justify-end gap-2 text-xs">
                          <Link
                            className="text-[color:var(--brand-accent)] hover:underline"
                            href={`${documentRouteBase(p)}/${p.id}`}
                          >
                            Ver
                          </Link>
                          <Link
                            className="text-[color:var(--brand-accent)] hover:underline"
                            href={`${documentRouteBase(p)}/${p.id}/imprimir`}
                          >
                            Imprimir
                          </Link>
                          <button
                            className="text-[color:var(--brand-accent)] hover:underline"
                            onClick={() => setSendModal({ proforma: p, tab: "whatsapp" })}
                          >
                            WhatsApp
                          </button>
                          <button
                            className="text-[color:var(--brand-accent)] hover:underline"
                            onClick={() => setSendModal({ proforma: p, tab: "email" })}
                          >
                            Correo
                          </button>
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
          <SendInvoiceModal
            proforma={sendModal.proforma}
            open={sendModal.proforma !== null}
            onClose={() => setSendModal({ proforma: null, tab: "whatsapp" })}
            initialTab={sendModal.tab}
          />
        </TabsContent>

        <TabsContent value="recommendations">
          <Card>
            <CardContent>
              {recommendations.length === 0 && (
                <p className="text-center py-8 text-sm opacity-60">
                  Sin recomendaciones aún.
                </p>
              )}
              <ul className="space-y-3">
                {recommendations.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-lg border border-black/5 bg-[color:var(--brand-bg)] p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="primary">{r.skinType}</Badge>
                      {r.conditionLabels.map((l) => (
                        <Badge key={l} tone="info" outlined>
                          {l}
                        </Badge>
                      ))}
                      <span className="ml-auto text-xs opacity-60">
                        por {r.authorName} · {formatDate(r.createdAt)}
                      </span>
                    </div>
                    <div className="mt-2 text-sm font-medium">
                      Objetivos: {r.goals.join(" · ")}
                    </div>
                    <p className="mt-1 text-sm opacity-80">{r.instructions}</p>
                    {r.followUpAt && (
                      <p className="mt-2 text-xs">
                        Seguimiento: <strong>{formatDate(r.followUpAt)}</strong>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes">
          <Card>
            <CardContent>
              <ul className="space-y-3">
                {notes.length === 0 && (
                  <p className="text-center py-8 text-sm opacity-60">
                    Sin notas.
                  </p>
                )}
                {notes.map((n) => (
                  <li
                    key={n.id}
                    className="rounded-lg border border-black/5 bg-white p-3"
                  >
                    <div className="flex items-center gap-2 text-xs opacity-60">
                      {n.pinned && (
                        <Badge tone="warning">
                          <Pin className="h-3 w-3" />
                          Pinneada
                        </Badge>
                      )}
                      <span>{n.authorName}</span>
                      <span>·</span>
                      <span>{formatDateTime(n.createdAt)}</span>
                    </div>
                    <p className="mt-2 text-sm">{n.body}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conversations">
          <Card>
            <CardContent className="py-12 text-center text-sm opacity-60">
              Conversaciones WhatsApp del cliente disponibles en{" "}
              <Link
                href="/whatsapp/conversaciones"
                className="text-[color:var(--brand-accent)] hover:underline"
              >
                /whatsapp/conversaciones
              </Link>
              .
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function DataRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-[10px] uppercase tracking-wider opacity-50">
        <Icon className="h-3 w-3" />
        {label}
      </dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}
