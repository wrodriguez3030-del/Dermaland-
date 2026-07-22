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
  Printer,
  Send,
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
  Skeleton,
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
import { useCustomerProfile } from "@/features/customers/customer-profile-hooks";
import { isNewCustomer } from "@/features/customers/customer-flags";
import { purchasesByMonth } from "@/features/customers/customer-purchases";
import { BarChart } from "@/components/ui/bar-chart";
import { getCustomerNotes } from "@/lib/mock-data/customers";
import {
  comprobanteLabel,
} from "@/features/sales/sales-report";
import { documentRouteBase } from "@/features/sales/document-label";
import { SendInvoiceModal } from "@/features/sales/components/send-invoice-modal";
import { RowActions } from "@/components/ui/row-actions";
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

interface SentMessage {
  id: string;
  channel: "whatsapp" | "email";
  to: string | null;
  documentNumber: string | null;
  sentAt: string;
  userName: string | null;
}

export default function ClienteDetallePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  // Estados EXPLÍCITOS: loading (skeleton) / notFound / error / success.
  // El perfil pide SOLO su cliente y SOLO sus compras (filtradas en servidor)
  // — nunca todas las ventas del negocio.
  const {
    customer: c,
    purchases: proformas,
    stats,
    loading,
    notFound,
    error,
    retry,
  } = useCustomerProfile(id);
  const [sendModal, setSendModal] = React.useState<{
    proforma: Proforma | null;
    tab: "whatsapp" | "email";
  }>({ proforma: null, tab: "whatsapp" });

  // Historial de envíos (WhatsApp/correo) para la pestaña Conversaciones.
  const [messages, setMessages] = React.useState<SentMessage[]>([]);
  React.useEffect(() => {
    if (!id) return;
    let alive = true;
    fetch(`/api/customers/${id}/messages`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((b: { messages?: SentMessage[] }) => {
        if (alive) setMessages(b.messages ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);

  // ── Cargando: skeleton profesional. NUNCA "no encontrado" durante la carga.
  if (loading) {
    return <ClienteDetalleSkeleton />;
  }

  // ── Error de red/servidor: mensaje amigable + reintentar (sin jerga técnica).
  if (error) {
    return (
      <>
        <PageHeader
          title="Cliente"
          breadcrumbs={[{ label: "Clientes", href: "/clientes" }, { label: "Detalle" }]}
        />
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm opacity-70">
              No pudimos cargar la información del cliente. Intenta nuevamente.
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <Button size="sm" onClick={retry}>
                Reintentar
              </Button>
              <Link href="/clientes">
                <Button variant="outline" size="sm">
                  Volver a clientes
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  // ── Not found REAL: la consulta terminó y el cliente no existe.
  //    Mensaje amigable, sin UUID técnico.
  if (notFound || !c) {
    return (
      <>
        <PageHeader
          title="Cliente no encontrado"
          breadcrumbs={[{ label: "Clientes", href: "/clientes" }, { label: "Detalle" }]}
        />
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm opacity-70">
              No encontramos este cliente. Puede haber sido eliminado o el
              enlace no es válido.
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <Link href="/clientes">
                <Button size="sm">Volver a clientes</Button>
              </Link>
              <Button variant="outline" size="sm" onClick={retry}>
                Reintentar
              </Button>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  const notes = getCustomerNotes(c.id);
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
        titleBadge={isNewCustomer(c) ? <Badge tone="success">Nuevo</Badge> : null}
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
            <CardTitle>Compras por mes</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const byMonth = purchasesByMonth(proformas);
              const hasData = byMonth.some((m) => m.value > 0);
              if (!hasData) {
                return (
                  <p className="text-sm opacity-60">
                    Sin compras en los últimos meses.
                  </p>
                );
              }
              return (
                <>
                  <BarChart data={byMonth} formatter={formatCurrency} />
                  <p className="mt-3 text-[11px] opacity-50">
                    Gasto por mes (últimos 6 meses).
                  </p>
                </>
              );
            })()}
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
                        <RowActions
                          viewHref={`${documentRouteBase(p)}/${p.id}`}
                          canEdit={false}
                          canDelete={false}
                          customActions={[
                            {
                              label: "Imprimir",
                              icon: Printer,
                              href: `${documentRouteBase(p)}/${p.id}/print`,
                            },
                            {
                              label: "Enviar WhatsApp",
                              icon: Send,
                              onClick: () =>
                                setSendModal({ proforma: p, tab: "whatsapp" }),
                            },
                            {
                              label: "Enviar por correo",
                              icon: Mail,
                              onClick: () =>
                                setSendModal({ proforma: p, tab: "email" }),
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
            <CardContent className={messages.length === 0 ? "py-12 text-center text-sm opacity-60" : "p-0"}>
              {messages.length === 0 ? (
                "Aún no se han enviado facturas a este cliente por WhatsApp o correo."
              ) : (
                <ul className="divide-y divide-black/5">
                  {messages.map((m) => (
                    <li key={m.id} className="flex items-start gap-3 px-5 py-3">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color:var(--brand-primary)]/10 text-[color:var(--brand-accent)]">
                        {m.channel === "email" ? (
                          <Mail className="h-4 w-4" />
                        ) : (
                          <MessageSquare className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1 text-sm">
                        <div>
                          <span className="font-medium">
                            {m.channel === "email"
                              ? "Factura enviada por correo"
                              : "Factura enviada por WhatsApp"}
                          </span>
                          {m.documentNumber && (
                            <span className="font-mono text-xs opacity-70">
                              {" "}
                              · {m.documentNumber}
                            </span>
                          )}
                        </div>
                        {m.to && (
                          <div className="text-xs opacity-70">a {m.to}</div>
                        )}
                        <div className="text-xs opacity-50">
                          {formatDateTime(m.sentAt)} ({relativeTime(m.sentAt)})
                          {m.userName ? ` · por ${m.userName}` : ""}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
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

/**
 * Skeleton del perfil mientras carga: encabezado, KPIs, datos personales e
 * historial. Reemplaza al antiguo flash de "Cliente no encontrado".
 */
function ClienteDetalleSkeleton() {
  return (
    <div data-testid="cliente-detalle-skeleton">
      {/* Volver + encabezado */}
      <Skeleton className="mb-4 h-3 w-28" />
      <div className="mb-6">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="mt-2 h-4 w-40" />
      </div>

      {/* KPIs */}
      <div className="mb-6 grid gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="py-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-3 h-6 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Datos personales + notas */}
      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="py-5">
            <Skeleton className="h-4 w-36" />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i}>
                  <Skeleton className="h-2.5 w-16" />
                  <Skeleton className="mt-2 h-4 w-32" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-4 h-16 w-full" />
          </CardContent>
        </Card>
      </div>

      {/* Historial */}
      <Card>
        <CardContent className="py-5">
          <Skeleton className="h-4 w-40" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
