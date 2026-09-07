"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { RowActions } from "@/components/ui/row-actions";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
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
import { StatCard } from "@/components/ui/stat-card";
import { useToast } from "@/components/ui/toast";
import { Coins, Receipt, ShoppingCart, TrendingUp, Printer, Send, Mail, Trash2, Pencil, Plus, X } from "lucide-react";
import { useProformas } from "@/features/sales/proforma-store";
import { SendInvoiceModal } from "@/features/sales/components/send-invoice-modal";
import {
  isInvoiceDocument,
  saleDocumentLabel,
  saleDocumentTone,
} from "@/features/sales/document-label";
import { documentEditability } from "@/features/sales/editability";
import { canEditSales } from "@/features/billing/permissions";
import { esVentaCompletada } from "@/features/sales/venta-completada";
import { useCurrentUser } from "@/features/auth/current-user";
import { EtiquetaOrigen } from "@/features/ventas/etiqueta-origen";
import { useListadoVentas } from "@/features/ventas/ventas-api";
import {
  pinturaEstadoVenta,
  type VentaUnificada,
} from "@/features/ventas/venta-unificada";
import {
  filtrosSinHistorico,
  LeyendaHistorico,
  useHistoricoAlegra,
} from "@/app/(app)/reportes/ventas/historico-alegra";
import type { Proforma } from "@/types";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  isToday,
} from "@/lib/utils/format";

const NO_SELLER = "__none__";

/**
 * Hoy en `YYYY-MM-DD`, con la MISMA noción de «hoy» que `isToday` (hora local
 * del navegador). Es lo que se le manda a `/api/ventas` cuando el periodo es
 * «hoy»: si una mitad contara el día en hora local y la otra en otra zona, el
 * KPI y la tabla dejarían de cuadrar justo a medianoche.
 */
function hoyLocal(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Una fila de la tabla. O es una venta del sistema —y entonces lleva su
 * proforma completa, que es la que permite editar, imprimir y enviar— o es una
 * factura migrada de Alegra, que se ve y no se toca (Alegra manda, DermaLand
 * solo lee). Mismo reparto que la ficha del cliente.
 */
type FilaVenta =
  | { origen: "sistema"; id: string; fecha: string; proforma: Proforma }
  | { origen: "alegra"; id: string; fecha: string; venta: VentaUnificada };


function VentasContent() {
  const currentUser = useCurrentUser();
  // Ventas / Facturas: documentos fiscales emitidos (NCF B02/B01 y e-CF E32/E31).
  // Las proformas pendientes viven en la pantalla Proformas.
  const toast = useToast();
  const allDocuments = useProformas();
  const allSales = allDocuments.filter(isInvoiceDocument);

  // Por DEFECTO esta pantalla muestra solo las ventas de HOY (operación diaria).
  // Para ver el histórico completo: `?period=all` (o el botón "Ver todas"). La
  // definición de "hoy" (isInvoiceDocument + isToday) coincide con el KPI
  // "Ventas hoy" del dashboard.
  const params = useSearchParams();
  const period = params.get("period") === "all" ? "all" : "today";
  const scopedSales = React.useMemo(
    () =>
      period === "today"
        ? allSales.filter((s) => isToday(s.createdAt))
        : allSales,
    [allSales, period],
  );

  const [sellerFilter, setSellerFilter] = React.useState<string>("all");

  // Vendedores presentes en las ventas (para el filtro), por id → nombre.
  const sellerOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    let hasUnassigned = false;
    for (const s of scopedSales) {
      if (s.sellerId) map.set(s.sellerId, s.sellerName || "Vendedor");
      else hasUnassigned = true;
    }
    return {
      list: [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "es")),
      hasUnassigned,
    };
  }, [scopedSales]);

  const sales = React.useMemo(() => {
    if (sellerFilter === "all") return scopedSales;
    if (sellerFilter === NO_SELLER) return scopedSales.filter((s) => !s.sellerId);
    return scopedSales.filter((s) => s.sellerId === sellerFilter);
  }, [scopedSales, sellerFilter]);

  /**
   * 🔴 Las anuladas no suman — restricción dura del proyecto.
   *
   * `isInvoiceDocument` clasifica por tipo de documento (`documentKind` /
   * `ecfType`) y **no mira `status` jamás**, así que `sales` incluye las
   * facturas ANULADAS del sistema. Mientras esta pantalla era un listado del
   * día daba igual; desde que su titular presenta el mismo número que el panel,
   * sumarlas haría que dijera MÁS que el panel —que cuenta con
   * `esVentaCompletada`— sin que ninguna de las dos dijera por qué. Hoy no se
   * nota porque `proformas` tiene 0 filas; se notará con la primera venta
   * anulada del punto de venta, y entonces habrá dinero de por medio.
   *
   * La TABLA sigue enseñándolas con su badge de estado: se ven, no se suman.
   */
  const ventasContadas = React.useMemo(
    () => sales.filter((p) => esVentaCompletada(p.status)),
    [sales],
  );
  const noCuentan = sales.length - ventasContadas.length;

  const canEdit = canEditSales(currentUser.role);

  const [sendDoc, setSendDoc] = React.useState<{
    doc: Proforma;
    tab: "whatsapp" | "email";
  } | null>(null);

  // ── Histórico migrado de Alegra ─────────────────────────────────────────
  // El panel invita a esta pantalla con «Ver ventas» y su tarjeta ya cuenta
  // los RD$48,4 millones migrados; aterrizar aquí en RD$0.00 —ni siquiera con
  // `?period=all`— era el mismo silencio que motivó el plan, a un clic de la
  // tarjeta que el plan arregló.
  //
  // Se reutiliza TAL CUAL lo que ya usa el reporte de ventas: el total lo
  // calcula la base (`?vista=resumen`) y aquí no se suma una sola fila; la
  // tabla pide UNA página de `?vista=listado` (tope de 200 del servidor).
  const rango: { desde?: string; hasta?: string } =
    period === "today" ? { desde: hoyLocal(), hasta: hoyLocal() } : {};
  // `/api/ventas` sabe filtrar por fecha, sucursal y cliente — por vendedor NO.
  // Sumar el histórico SIN filtrar a un total del sistema que sí está filtrado
  // por vendedora daría un número que nadie podría cuadrar: con ese filtro
  // puesto el histórico se queda fuera y la leyenda lo dice.
  const filtrosNoAplicables = filtrosSinHistorico([
    { etiqueta: "Vendedor", activo: sellerFilter !== "all" },
  ]);
  const historicoParticipa = filtrosNoAplicables.length === 0;
  const historico = useHistoricoAlegra({
    desde: rango.desde,
    hasta: rango.hasta,
    cantidadSistema: ventasContadas.length,
    incluir: true,
    filtrosNoAplicables,
  });
  const listado = useListadoVentas({ ...rango, limite: 200 }, historicoParticipa);
  const ventasAlegra =
    listado.tipo === "listo"
      ? listado.datos.ventas.filter((v) => v.origen === "alegra")
      : [];
  const hayMasAlegra = listado.tipo === "listo" && listado.datos.hayMas;

  const filas = React.useMemo<FilaVenta[]>(() => {
    const delSistema: FilaVenta[] = sales.map((p) => ({
      origen: "sistema",
      id: p.id,
      fecha: p.createdAt,
      proforma: p,
    }));
    const migradas: FilaVenta[] = ventasAlegra.map((v) => ({
      origen: "alegra",
      id: v.id,
      fecha: v.fecha,
      venta: v,
    }));
    return [...delSistema, ...migradas].sort((a, b) =>
      a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0,
    );
    // `ventasAlegra` se recalcula en cada render a partir del estado del hook:
    // su identidad no vale como dependencia, la del estado sí.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sales, listado]);

  const pag = usePagination(filas, {
    resetKey: `${period}|${sellerFilter}|${historicoParticipa}`,
  });

  // Qué le falta a la TABLA (los KPIs los explica `LeyendaHistorico`): una
  // página no da para 14 743 facturas, y si la petición falla abajo solo queda
  // el sistema. En los dos casos se dice; callarlo dejaría al usuario sumando
  // filas incompletas.
  const avisoTabla: string | null = !historicoParticipa
    ? null
    : listado.tipo === "error"
      ? "No se pudieron cargar las ventas migradas de Alegra: abajo solo están las del sistema."
      : hayMasAlegra
        ? "La tabla enseña solo las ventas más recientes: el histórico migrado no cabe entero en una página. Los totales de arriba sí lo cuentan completo."
        : null;

  const totalSistema = ventasContadas.reduce((s, p) => s + p.total, 0);
  const itbis = ventasContadas.reduce((s, p) => s + p.itbis, 0);
  const items = ventasContadas.reduce(
    (s, p) => s + p.items.reduce((q, i) => q + i.quantity, 0),
    0,
  );
  const total = totalSistema + historico.total;
  const transacciones = ventasContadas.length + historico.cantidad;

  return (
    <>
      <PageHeader
        title="Ventas / Facturas"
        description="Facturas emitidas (NCF B02/B01 y e-CF E32/E31) y el histórico migrado de Alegra. Las proformas pendientes están en la pantalla Proformas."
        breadcrumbs={[{ label: "Ventas" }]}
        actions={
          <Link href="/pos" aria-label="Ir a POS / Nueva venta">
            <Button size="sm" title="Crear nueva venta">
              <Plus className="h-4 w-4" />
              POS / Nueva venta
            </Button>
          </Link>
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[color:var(--brand-primary)]/30 bg-[color:var(--brand-primary)]/5 px-4 py-2.5 text-sm">
        <span>
          Mostrando:{" "}
          <strong>{period === "today" ? "ventas de hoy" : "todas las ventas"}</strong>
        </span>
        {period === "today" ? (
          <Link href="/ventas?period=all">
            <Button variant="ghost" size="sm">
              Ver todas las ventas
            </Button>
          </Link>
        ) : (
          <Link href="/ventas">
            <Button variant="ghost" size="sm">
              <X className="h-4 w-4" /> Ver solo hoy
            </Button>
          </Link>
        )}
      </div>

      {/* Mientras el histórico está en camino NO hay número fiable que enseñar:
          hoy `proformas` está vacía y ese RD$0.00 provisional es exactamente lo
          que hizo creer que los datos no se habían migrado. Mismo criterio que
          el panel y que el reporte de ventas. */}
      <div className="mb-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={period === "today" ? "Ventas hoy" : "Ventas totales"}
          value={historico.cargando ? "Cargando…" : formatCurrency(total)}
          icon={Coins}
          tone="primary"
        />
        {/* El resumen de la base da total y cantidad, no ITBIS ni unidades: no
            existe forma de traer esas dos del histórico sin descargar las
            14 965 facturas. Así que dicen qué cuentan, en la etiqueta. */}
        <StatCard
          label="ITBIS recaudado (sistema)"
          value={formatCurrency(itbis)}
          hint="sin el histórico migrado"
          icon={TrendingUp}
        />
        <StatCard
          label="Transacciones"
          value={historico.cargando ? "Cargando…" : formatNumber(transacciones)}
          {...(noCuentan > 0
            ? { hint: `${formatNumber(noCuentan)} listadas no cuentan para el total` }
            : {})}
          icon={Receipt}
        />
        <StatCard
          label="Items vendidos (sistema)"
          value={formatNumber(items)}
          hint="sin el histórico migrado"
          icon={ShoppingCart}
        />
      </div>
      {/* De dónde sale el total: cuánto pone el sistema y cuánto el histórico.
          Un total que mezcla dos fuentes sin decirlo no se puede auditar. */}
      <div className="mb-6">
        <LeyendaHistorico leyenda={historico.leyenda} />
      </div>

      <FilterBar className="mb-4">
        <Select
          value={sellerFilter}
          onChange={(e) => setSellerFilter(e.target.value)}
          aria-label="Filtrar por vendedor"
        >
          <option value="all">Todos los vendedores</option>
          {sellerOptions.list.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
          {sellerOptions.hasUnassigned && (
            <option value={NO_SELLER}>No asignado</option>
          )}
        </Select>
      </FilterBar>

      {avisoTabla && (
        <p className="mb-3 flex items-start gap-1.5 text-xs font-medium text-amber-700">
          <span aria-hidden>⚠</span>
          <span>
            {avisoTabla}{" "}
            <Link href="/reportes/ventas" className="underline">
              Ver el histórico completo en Reportes → Ventas
            </Link>
            .
          </span>
        </p>
      )}

      <Card>
        <CardContent className="p-0">
          {/* Móvil: tarjetas */}
          <div className="divide-y divide-slate-100 md:hidden">
            {pag.pageItems.length === 0 && (
              <div className="px-4 py-10 text-center text-sm opacity-60">Sin ventas.</div>
            )}
            {pag.pageItems.map((fila) =>
              fila.origen === "sistema" ? (
                <Link
                  key={fila.id}
                  href={`/ventas/${fila.proforma.id}`}
                  className="block px-4 py-3 active:bg-black/[0.03]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-mono text-sm">
                        {fila.proforma.ecfNumber ?? fila.proforma.number}
                      </div>
                      <div className="mt-0.5 truncate text-xs opacity-70">
                        {fila.proforma.customerName}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <Badge tone={saleDocumentTone(fila.proforma)}>
                          {saleDocumentLabel(fila.proforma)}
                        </Badge>
                        <Badge
                          tone={
                            fila.proforma.status === "paid"
                              ? "success"
                              : fila.proforma.status === "partially_paid"
                                ? "warning"
                                : "info"
                          }
                        >
                          {fila.proforma.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-bold tabular-nums text-[color:var(--brand-accent)]">
                        {formatCurrency(fila.proforma.total)}
                      </div>
                      <div className="text-[10px] opacity-50">
                        {formatDateTime(fila.proforma.createdAt)}
                      </div>
                    </div>
                  </div>
                </Link>
              ) : (
                /* Migrada de Alegra: sin enlace, porque no hay detalle que
                   abrir en DermaLand. Lleva su etiqueta de origen. */
                <div key={fila.id} className="block px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-mono text-sm">{fila.venta.numero}</div>
                      <div className="mt-0.5 truncate text-xs opacity-70">
                        {fila.venta.clienteNombre ?? "—"}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <EtiquetaOrigen origen={fila.venta.origen} />
                        {/* 🔴 En móvil no hay columna de Estado: sin este badge
                            lo único que se veía de un borrador era un importe
                            tachado, o sea una afirmación falsa y sola. */}
                        <Badge tone={pinturaEstadoVenta(fila.venta.estado).tono}>
                          {pinturaEstadoVenta(fila.venta.estado).etiqueta ?? "Histórico"}
                        </Badge>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-bold tabular-nums text-[color:var(--brand-accent)]">
                        {pinturaEstadoVenta(fila.venta.estado).tachada ? (
                          <span className="line-through opacity-60">
                            {formatCurrency(fila.venta.total)}
                          </span>
                        ) : pinturaEstadoVenta(fila.venta.estado).atenuada ? (
                          <span className="opacity-60">{formatCurrency(fila.venta.total)}</span>
                        ) : (
                          formatCurrency(fila.venta.total)
                        )}
                      </div>
                      <div className="text-[10px] opacity-50">{formatDate(fila.venta.fecha)}</div>
                    </div>
                  </div>
                </div>
              ),
            )}
          </div>

          {/* Desktop: tabla */}
          <div className="hidden md:block">
          <Table>
            <THead>
              <TR>
                <TH>Hora</TH>
                <TH>Comprobante</TH>
                <TH>Documento</TH>
                <TH>Cliente</TH>
                <TH>Cajero</TH>
                <TH>Vendedor</TH>
                <TH className="text-right">Total</TH>
                <TH>Estado</TH>
                <TH className="text-right pr-4">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {pag.pageItems.map((fila) =>
                fila.origen === "sistema" ? (
                  <TR key={fila.id}>
                    <TD className="text-xs">{formatDateTime(fila.proforma.createdAt)}</TD>
                    <TD>
                      <Link
                        href={`/ventas/${fila.proforma.id}`}
                        className="font-mono text-xs hover:text-[color:var(--brand-accent)]"
                      >
                        {fila.proforma.ecfNumber ?? fila.proforma.number}
                      </Link>
                    </TD>
                    <TD>
                      <Badge tone={saleDocumentTone(fila.proforma)}>
                        {saleDocumentLabel(fila.proforma)}
                      </Badge>
                    </TD>
                    <TD className="text-sm">{fila.proforma.customerName}</TD>
                    <TD className="text-sm opacity-70">{fila.proforma.cashierName}</TD>
                    <TD className="text-sm">
                      {fila.proforma.sellerName ?? (
                        <span className="opacity-40">No asignado</span>
                      )}
                    </TD>
                    <TD className="text-right tabular-nums font-medium">
                      {formatCurrency(fila.proforma.total)}
                    </TD>
                    <TD>
                      <Badge
                        tone={
                          fila.proforma.status === "paid"
                            ? "success"
                            : fila.proforma.status === "partially_paid"
                              ? "warning"
                              : "info"
                        }
                      >
                        {fila.proforma.status}
                      </Badge>
                    </TD>
                    <TD className="pr-4">
                      <RowActions
                        viewHref={`/ventas/${fila.proforma.id}`}
                        canEdit={false}
                        canDelete={false}
                        customActions={[
                          {
                            label: "Editar factura",
                            icon: Pencil,
                            ...(canEdit && documentEditability(fila.proforma).editable
                              ? { href: `/ventas/${fila.proforma.id}/editar` }
                              : {
                                  disabled: true,
                                  disabledReason: !canEdit
                                    ? "No tienes permiso para editar facturas."
                                    : documentEditability(fila.proforma).reason ??
                                      "Este documento no se puede editar.",
                                }),
                          },
                          {
                            label: "Imprimir",
                            icon: Printer,
                            href: `/ventas/${fila.proforma.id}/print`,
                          },
                          {
                            label: "Enviar WhatsApp",
                            icon: Send,
                            onClick: () => setSendDoc({ doc: fila.proforma, tab: "whatsapp" }),
                          },
                          {
                            label: "Enviar por correo",
                            icon: Mail,
                            onClick: () => setSendDoc({ doc: fila.proforma, tab: "email" }),
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
                ) : (
                  /* Factura migrada de Alegra: historial de otro sistema. Se
                     ve, no se toca — ni editar, ni anular, ni enviar. */
                  <TR key={fila.id}>
                    <TD className="text-xs">{formatDate(fila.venta.fecha)}</TD>
                    <TD className="font-mono text-xs">{fila.venta.numero}</TD>
                    <TD>
                      <EtiquetaOrigen origen={fila.venta.origen} />
                    </TD>
                    <TD className="text-sm">{fila.venta.clienteNombre ?? "—"}</TD>
                    <TD className="text-sm opacity-40">—</TD>
                    <TD className="text-sm">
                      {fila.venta.vendedor ?? <span className="opacity-40">No asignado</span>}
                    </TD>
                    {/* 🔴 Tachar el importe ES decir «anulada». La decisión la
                        toma `pinturaEstadoVenta`, nunca `anulada` —que también
                        es `true` para un BORRADOR—: así el badge y el importe
                        no pueden contradecirse en la misma fila. */}
                    <TD className="text-right tabular-nums font-medium">
                      {pinturaEstadoVenta(fila.venta.estado).tachada ? (
                        <span className="line-through opacity-60">
                          {formatCurrency(fila.venta.total)}
                        </span>
                      ) : pinturaEstadoVenta(fila.venta.estado).atenuada ? (
                        <span className="opacity-60">{formatCurrency(fila.venta.total)}</span>
                      ) : (
                        formatCurrency(fila.venta.total)
                      )}
                    </TD>
                    <TD>
                      <Badge tone={pinturaEstadoVenta(fila.venta.estado).tono}>
                        {/* «Histórico» es lo que dice una migrada vigente: su
                            origen ya está en la columna de al lado. */}
                        {pinturaEstadoVenta(fila.venta.estado).etiqueta ?? "Histórico"}
                      </Badge>
                    </TD>
                    <TD
                      className="pr-4 text-right text-xs opacity-60"
                      title="Factura migrada de Alegra: se puede ver, no editar ni enviar desde DermaLand. Alegra manda y DermaLand solo lee."
                    >
                      Solo lectura
                    </TD>
                  </TR>
                ),
              )}
            </TBody>
          </Table>
          </div>
          {filas.length > 0 && (
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
      <SendInvoiceModal
        proforma={sendDoc?.doc ?? null}
        open={sendDoc != null}
        initialTab={sendDoc?.tab ?? "whatsapp"}
        onClose={() => setSendDoc(null)}
      />

      <toast.Toast />
    </>
  );
}

export default function VentasPage() {
  return (
    <React.Suspense
      fallback={<div className="p-6 text-sm opacity-60">Cargando ventas…</div>}
    >
      <VentasContent />
    </React.Suspense>
  );
}
