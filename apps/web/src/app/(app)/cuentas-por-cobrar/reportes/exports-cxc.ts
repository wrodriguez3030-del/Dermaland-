import { AGING_LABEL } from "@/features/receivables/aging";
import type { ReceivableRow } from "@/features/receivables/receivables-client";
import type { PdfSection } from "@/lib/reports/pdf/types";
import type { TableSpec } from "@/lib/reports/excel/types";

/**
 * Las tres salidas de `/cuentas-por-cobrar/reportes` (Excel, PDF y CSV), aquí
 * fuera y probadas.
 *
 * 🔴 Estos tres papeles son la lista de trabajo de la cobranza: la encargada
 * exporta el PDF «Facturas vencidas» y llama a los clientes que salen en él.
 * Desde que `listPending` devuelve `[...sistema, ...alegra]`, ahí dentro hay
 * deuda migrada cuyo pago se registra en Alegra, no en DermaLand — y salía sin
 * una sola marca de origen. Reclamar por teléfono una factura que se paga en
 * el otro sistema es exactamente el fallo que el PDF del estado de cuenta ya
 * cerró (`estados-de-cuenta/pdf-estado-cuenta.ts`): mismo módulo, mismo papel,
 * mismo arreglo.
 *
 * En un papel no hay `title` que consultar al pasar el ratón: o se lee, o no
 * existe.
 */

/** Cómo se llama cada fuente EN EL PAPEL. Un solo sitio para los tres formatos. */
export function textoOrigen(fila: Pick<ReceivableRow, "origen">): string {
  return fila.origen === "alegra" ? "Migrada de Alegra" : "Sistema";
}

/** La nota, con las mismas palabras que el PDF del estado de cuenta. */
export const NOTA_MIGRADAS =
  "Las facturas marcadas «Migrada de Alegra» proceden del sistema anterior: " +
  "su pago se registra en Alegra, no en DermaLand.";

const hayMigradas = (filas: Pick<ReceivableRow, "origen">[]): boolean =>
  filas.some((f) => f.origen === "alegra");

/**
 * Etiqueta de filtros de la cabecera del Excel.
 *
 * `TableSpec` no tiene ninguna clave de nota y `ReportMeta` tampoco: el único
 * hueco donde cabe un aviso que se pinte de verdad
 * (`professional-workbook.ts`, línea «Filtros: …») es este. Se cuelga aquí
 * porque la cabecera sale en TODAS las hojas, incluidas las agregadas
 * («Morosos», «Por vendedor»), que también mezclan las dos fuentes sin poder
 * llevar una columna de origen.
 */
export function etiquetaFiltrosCxc(filas: Pick<ReceivableRow, "origen">[]): string {
  return hayMigradas(filas) ? NOTA_MIGRADAS : "Sin filtros adicionales";
}

/** Hoja «Pendientes»: la tabla de facturas, cada una con su origen. */
export function tablaPendientesExcel(pending: ReceivableRow[]): TableSpec {
  return {
    title: "Facturas con saldo pendiente",
    autoFilter: true,
    columns: [
      { header: "Factura", key: "number" },
      { header: "Origen", key: "origen", width: 18 },
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
      origen: textoOrigen(r),
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
    totals: {
      customer: "TOTAL",
      balance: Math.round(pending.reduce((s, r) => s + r.balance, 0) * 100) / 100,
    },
  };
}

/**
 * Sección «Facturas vencidas» del PDF: la lista con la que se sale a cobrar.
 *
 * 🔴 `footnote` va en la SECCIÓN (`PdfSection`). Una `note` dentro de `table`
 * la descarta el motor EN SILENCIO —`PdfTable` no tiene esa clave y
 * `report-pdf.ts` solo pinta `PdfSection.footnote`—, así que el papel saldría
 * igual de mudo y nadie se enteraría.
 */
export function seccionFacturasVencidas(overdue: ReceivableRow[]): PdfSection {
  return {
    title: "Facturas vencidas",
    table: {
      columns: [
        { header: "Factura", key: "number" },
        { header: "Origen", key: "origen" },
        { header: "Cliente", key: "cliente", weight: 2 },
        { header: "Vence", key: "due", format: "date" },
        { header: "Días", key: "dias", format: "int", align: "right" },
        { header: "Saldo", key: "balance", format: "currency", align: "right" },
      ],
      rows: overdue.map((r) => ({
        number: r.number,
        origen: textoOrigen(r),
        cliente: r.customerName,
        due: r.dueDate,
        dias: r.overdueDays,
        balance: r.balance,
      })),
      totals: {
        cliente: "TOTAL",
        balance: Math.round(overdue.reduce((s, r) => s + r.balance, 0) * 100) / 100,
      },
      emptyMessage: "Sin facturas vencidas.",
    },
    ...(hayMigradas(overdue) ? { footnote: NOTA_MIGRADAS } : {}),
  };
}

/** Cabecera del CSV. La columna `Origen` es la ÚNICA vía: aquí no hay meta. */
export const CABECERA_CSV =
  "Factura,Origen,e-CF,Cliente,Sucursal,Vendedor,Emision,Vence,DiasVencidos,Monto,Saldo,Estado";

const escapa = (v: string | number | null): string =>
  `"${String(v ?? "").replace(/"/g, '""')}"`;

/** CSV completo (cabecera + filas), con CRLF, tal como se descarga. */
export function csvPendientes(pending: ReceivableRow[]): string {
  const lineas = pending.map((r) =>
    [
      r.number,
      textoOrigen(r),
      r.ecfNumber ?? "",
      r.customerName,
      r.branchName,
      r.sellerName ?? r.cashierName,
      r.issuedAt,
      r.dueDate ?? "",
      r.overdueDays,
      r.total,
      r.balance,
      AGING_LABEL[r.bucket],
    ]
      .map(escapa)
      .join(","),
  );
  return [CABECERA_CSV, ...lineas].join("\r\n");
}
