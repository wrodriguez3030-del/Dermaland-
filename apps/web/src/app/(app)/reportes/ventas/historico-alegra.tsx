"use client";

import * as React from "react";
import { AlertTriangle, Archive, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils/format";
import { EtiquetaOrigen } from "@/features/ventas/etiqueta-origen";
import { pinturaEstadoVenta, type EstadoVenta } from "@/features/ventas/venta-unificada";
import {
  textoDesgloseOrigen,
  useListadoVentas,
  useResumenVentas,
  type EstadoVentas,
  type FiltrosVentasApi,
  type ResumenVentasApi,
} from "@/features/ventas/ventas-api";
import { METODO_ETIQUETA } from "@/features/alegra/sales-report";
import type { SalesReportFilters } from "@/features/sales/sales-report";

/**
 * El histórico migrado de Alegra dentro del reporte de ventas.
 *
 * Vive aparte del reporte (`page.tsx`, ya por encima del máximo de 800 líneas
 * de la casa) y hace las dos cosas que el reporte necesita del histórico:
 *
 *  - `useHistoricoAlegra` → el TOTAL, calculado en la base. Es lo que se suma
 *    a los KPIs. Nunca se descargan facturas para contarlas: son 14 965.
 *  - `TablaHistoricoAlegra` → una PÁGINA de facturas migradas, de solo
 *    lectura y con su etiqueta de origen. Una factura de Alegra se ve, no se
 *    toca: es historial de otro sistema.
 */

/** Filas por página del detalle. El servidor nunca da más de 200. */
const POR_PAGINA = 50;

/** Qué filtros del reporte NO sabe aplicar `/api/ventas` al histórico. */

/**
 * Importe con la marca de su estado. Tacha SOLO lo anulado; lo que no cuenta
 * por otra razón (un borrador) se atenúa y lleva su palabra al lado.
 */
function ImporteConEstado({ estado, total }: { estado: EstadoVenta; total: number }) {
  const p = pinturaEstadoVenta(estado);
  if (p.tachada) return <span className="line-through opacity-60">{formatCurrency(total)}</span>;
  if (!p.atenuada) return <>{formatCurrency(total)}</>;
  return (
    <span className="opacity-60">
      {formatCurrency(total)}{" "}
      <span className="text-[10px] uppercase tracking-wide">{p.etiqueta}</span>
    </span>
  );
}

export interface FiltroSinHistorico {
  /** Nombre visible del filtro, tal como se llama en la pantalla. */
  etiqueta: string;
  /** `true` si el usuario lo tiene puesto ahora mismo. */
  activo: boolean;
}

/**
 * Lista de los filtros activos que el histórico no puede honrar. Si hay
 * alguno, el histórico NO se suma: sumar un total sin filtrar a otro filtrado
 * da un número que no significa nada y que nadie podría cuadrar.
 */
export function filtrosSinHistorico(filtros: FiltroSinHistorico[]): string[] {
  return filtros.filter((f) => f.activo).map((f) => f.etiqueta);
}

/**
 * 🔴 Qué filtros del reporte de ventas dejan al histórico fuera.
 *
 * Vive aquí, y no como un literal dentro de `page.tsx`, porque es una regla de
 * dinero: `/api/ventas` solo sabe filtrar por fecha, sucursal y cliente. Si
 * alguien borrara de esta lista, por ejemplo, «Método de pago», la pantalla
 * sumaría los RD$48 millones del histórico SIN FILTRAR a un total del sistema
 * que sí está filtrado por «Efectivo», y lo presentaría como un total filtrado.
 * Una regla así se prueba una por una, no se confía a un literal en el JSX.
 *
 * `includeProformas` NO entra a propósito: excluye documentos no facturados
 * del sistema, y en Alegra todo lo migrado son facturas — el filtro no cambia
 * lo que el histórico debería aportar. `from`/`hasta` y `branchId` tampoco:
 * esos SÍ los sabe aplicar la ruta.
 */
export function filtrosDelReporteSinHistorico(filtros: SalesReportFilters): string[] {
  return filtrosSinHistorico([
    { etiqueta: "Método de pago", activo: Boolean(filtros.method) },
    { etiqueta: "Tipo de comprobante", activo: Boolean(filtros.comprobante) },
    { etiqueta: "Estado", activo: Boolean(filtros.status) },
    { etiqueta: "Cajero", activo: Boolean(filtros.cashierId) },
    { etiqueta: "Vendedor", activo: Boolean(filtros.sellerId) },
    { etiqueta: "Cliente", activo: Boolean(filtros.customerQuery?.trim()) },
    { etiqueta: "Producto", activo: Boolean(filtros.productQuery?.trim()) },
  ]);
}

export interface EstadoHistorico {
  /** `true` mientras el total está en camino: no hay número fiable que enseñar. */
  cargando: boolean;
  /** Total migrado que entra en los KPIs. 0 si el histórico no participa. */
  total: number;
  /** Facturas migradas que entran en los KPIs. 0 si el histórico no participa. */
  cantidad: number;
  /** ITBIS migrado. Mide lo mismo que el del sistema: se puede sumar. */
  itbis: number;
  /** Unidades vendidas migradas (cantidades de las líneas). */
  unidades: number;
  /** Descuentos migrados, de la cabecera de la factura. */
  descuento: number;
  /**
   * Clientes distintos sobre la UNIÓN de las dos fuentes — NO solo los de
   * Alegra. Sumarlo a los del sistema contaría dos veces a quien compró en los
   * dos sitios, así que este número YA es el final y se usa tal cual.
   */
  clientesDistintos: number;
  /** `true` si el histórico está sumándose de verdad a los totales. */
  participa: boolean;
  /** Explicación bajo los KPIs. Con `aviso` cuando lo que falta puede engañar. */
  leyenda: { aviso: boolean; texto: string };
}

/**
 * Decide, a partir del estado de la petición y de los filtros, QUÉ se suma a
 * los KPIs y qué se le dice al usuario. Es PURA a propósito: aquí vive la
 * regla que impide el fallo silencioso —enseñar un total incompleto como si
 * fuera el total— y una regla así se prueba, no se confía a la vista.
 */
export function resolverHistorico(entrada: {
  incluir: boolean;
  filtrosNoAplicables: string[];
  estado: EstadoVentas<ResumenVentasApi>;
  cantidadSistema: number;
}): EstadoHistorico {
  const nada = {
    cargando: false,
    total: 0,
    cantidad: 0,
    itbis: 0,
    unidades: 0,
    descuento: 0,
    clientesDistintos: 0,
    participa: false,
  };

  if (!entrada.incluir) {
    return {
      ...nada,
      leyenda: {
        aviso: false,
        texto: "Histórico migrado de Alegra excluido: solo ventas del sistema.",
      },
    };
  }
  if (entrada.filtrosNoAplicables.length > 0) {
    return {
      ...nada,
      leyenda: {
        aviso: true,
        texto:
          `El histórico migrado no se puede filtrar por ${entrada.filtrosNoAplicables.join(", ")}: ` +
          "estos totales son solo del sistema. Quita ese filtro para incluirlo.",
      },
    };
  }
  if (entrada.estado.tipo === "cargando") {
    return {
      ...nada,
      cargando: true,
      leyenda: { aviso: false, texto: "Cargando el histórico migrado de Alegra…" },
    };
  }
  if (entrada.estado.tipo === "error") {
    return {
      ...nada,
      leyenda: {
        aviso: true,
        texto: "No se pudo cargar el histórico migrado de Alegra. Mostrando solo lo del sistema.",
      },
    };
  }
  const alegra = entrada.estado.datos.porOrigen.alegra;
  return {
    cargando: false,
    total: alegra.total,
    cantidad: alegra.cantidad,
    itbis: alegra.itbis,
    unidades: alegra.unidades,
    descuento: alegra.descuento,
    // Ya viene resuelto sobre la unión: no se le suman los del sistema.
    clientesDistintos: entrada.estado.datos.clientesDistintos,
    participa: true,
    leyenda: {
      aviso: false,
      texto: textoDesgloseOrigen(entrada.cantidadSistema, alegra.cantidad),
    },
  };
}

/**
 * Totales del histórico para los KPIs del reporte.
 *
 * El histórico no se pide cuando el usuario desmarcó la casilla o cuando hay
 * un filtro que no sabe aplicar. En los dos casos su aporte es 0 y la leyenda
 * lo DICE: un KPI que se queda corto sin avisar es peor que uno que avisa.
 */
export function useHistoricoAlegra(opciones: {
  desde?: string | undefined;
  hasta?: string | undefined;
  sucursalId?: string | undefined;
  /** Ventas del sistema que ya cuentan los KPIs, para la línea del desglose. */
  cantidadSistema: number;
  incluir: boolean;
  /** Filtros activos que el histórico no sabe aplicar. */
  filtrosNoAplicables: string[];
}): EstadoHistorico {
  const activo = opciones.incluir && opciones.filtrosNoAplicables.length === 0;
  const filtros: FiltrosVentasApi = {
    desde: opciones.desde,
    hasta: opciones.hasta,
    sucursalId: opciones.sucursalId,
  };
  const estado = useResumenVentas(filtros, activo);
  return resolverHistorico({
    incluir: opciones.incluir,
    filtrosNoAplicables: opciones.filtrosNoAplicables,
    estado,
    cantidadSistema: opciones.cantidadSistema,
  });
}

/** Línea bajo los KPIs que explica de dónde sale el total. */
export function LeyendaHistorico({ leyenda }: { leyenda: EstadoHistorico["leyenda"] }) {
  return (
    <p
      className={
        leyenda.aviso
          ? "mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700"
          : "mt-2 text-xs opacity-60"
      }
    >
      {leyenda.aviso && <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />}
      {leyenda.texto}
    </p>
  );
}

/** Casilla «Incluir facturas migradas de Alegra». Marcada por defecto. */
export function CasillaIncluirAlegra({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="h-4 w-4"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      Incluir facturas migradas de Alegra
    </label>
  );
}

/**
 * Detalle paginado de las facturas migradas.
 *
 * Pide una página de ventas unificadas y se queda con las de Alegra: las del
 * sistema ya salen arriba, en «Detalle de ventas», con sus acciones. Una
 * página puede traer menos filas migradas de las pedidas cuando el rango
 * también tiene ventas del sistema; no se pierde ninguna —siguen ahí en la
 * página siguiente—, solo se ve una página más corta.
 */
export function TablaHistoricoAlegra({
  desde,
  hasta,
  sucursalId,
  activo,
}: {
  desde?: string | undefined;
  hasta?: string | undefined;
  sucursalId?: string | undefined;
  activo: boolean;
}) {
  const [pagina, setPagina] = React.useState(0);
  // Cambiar de filtro vuelve a la primera página: mantenerse en la 4ª de un
  // rango que ya no existe enseñaría una página vacía como si no hubiera datos.
  const clave = `${desde ?? ""}|${hasta ?? ""}|${sucursalId ?? ""}|${activo}`;
  const claveAnterior = React.useRef(clave);
  if (claveAnterior.current !== clave) {
    claveAnterior.current = clave;
    if (pagina !== 0) setPagina(0);
  }

  const estado = useListadoVentas(
    { desde, hasta, sucursalId, limite: POR_PAGINA, desplazamiento: pagina * POR_PAGINA },
    activo,
  );

  if (!activo) return null;

  const ventas =
    estado.tipo === "listo" ? estado.datos.ventas.filter((v) => v.origen === "alegra") : [];
  const hayMas = estado.tipo === "listo" && estado.datos.hayMas;

  return (
    <Card className="screen-only mb-6">
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <Archive className="h-4 w-4" aria-hidden />
            Histórico migrado de Alegra
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <p className="border-b px-4 py-2 text-xs opacity-60">
          Facturas del sistema anterior. Se ven, no se editan ni se anulan desde aquí: Alegra
          manda y DermaLand solo lee. Las ventas del sistema se listan arriba, en «Detalle de
          ventas». Las exportaciones (PDF, Excel, CSV) contienen solo las ventas del sistema.
        </p>
        {estado.tipo === "error" && (
          <p className="flex items-center gap-1.5 px-4 py-6 text-sm font-medium text-amber-700">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            {estado.mensaje}
          </p>
        )}
        {estado.tipo === "cargando" && (
          <p className="px-4 py-6 text-sm opacity-60">Cargando facturas migradas…</p>
        )}
        {estado.tipo === "listo" && (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Fecha</TH>
                  <TH>Comprobante</TH>
                  <TH>Cliente</TH>
                  <TH>Vendedor</TH>
                  <TH>Forma de pago</TH>
                  <TH className="text-right">Subtotal</TH>
                  <TH className="text-right">ITBIS</TH>
                  <TH className="text-right">Total</TH>
                  <TH className="pr-4">Origen</TH>
                </TR>
              </THead>
              <TBody>
                {ventas.length === 0 && (
                  <TR>
                    <TD colSpan={9} className="py-8 text-center text-sm opacity-60">
                      No hay facturas migradas de Alegra en este rango.
                    </TD>
                  </TR>
                )}
                {ventas.map((v) => (
                  <TR key={v.id}>
                    <TD className="text-xs">{formatDate(v.fecha)}</TD>
                    <TD className="font-mono text-xs">{v.numero}</TD>
                    <TD className="text-sm">{v.clienteNombre ?? "Sin cliente"}</TD>
                    <TD className="text-xs opacity-70">{v.vendedor ?? "—"}</TD>
                    <TD className="text-xs">
                      {METODO_ETIQUETA[v.formaPago ?? ""] ?? v.formaPago ?? "—"}
                    </TD>
                    <TD className="text-right tabular-nums">{formatCurrency(v.subtotal)}</TD>
                    <TD className="text-right tabular-nums">{formatCurrency(v.itbis)}</TD>
                    <TD className="text-right tabular-nums font-medium">
                      {/* 🔴 Tachar es decir «anulada». Un borrador tampoco
                          cuenta para los totales, pero no está anulado: se
                          marca con su palabra, no con la raya de otra cosa.
                          La decisión la toma `pinturaEstadoVenta`, no `anulada`. */}
                      <ImporteConEstado estado={v.estado} total={v.total} />
                    </TD>
                    <TD className="pr-4">
                      <EtiquetaOrigen origen={v.origen} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-xs">
              <span className="opacity-60">
                {formatNumber(ventas.length)} factura{ventas.length === 1 ? "" : "s"} migrada
                {ventas.length === 1 ? "" : "s"} en esta página
                {pagina > 0 ? ` · página ${pagina + 1}` : ""}
              </span>
              <span className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pagina === 0}
                  onClick={() => setPagina((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Anterior
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!hayMas}
                  onClick={() => setPagina((p) => p + 1)}
                >
                  Siguiente
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
