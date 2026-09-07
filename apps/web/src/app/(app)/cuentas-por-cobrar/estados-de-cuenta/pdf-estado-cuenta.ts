import { AGING_LABEL } from "@/features/receivables/aging";
import type { ReceivableRow } from "@/features/receivables/receivables-client";
import type { PdfSection } from "@/lib/reports/pdf/types";

/**
 * Sección «Facturas pendientes» del PDF del estado de cuenta.
 *
 * 🔴 Está aquí fuera, y probada, porque es el único sitio del módulo donde el
 * dato sale de la pantalla y llega a un cliente: la encargada exporta el PDF y
 * se lo manda por WhatsApp. Si ese papel —con membrete de DermaLand— reclama
 * facturas que se cobran en Alegra sin decirlo, el cliente recibe una
 * reclamación por algo que ya pagó, o que va a pagar, en el otro sistema. En el
 * PDF no hay `title` que consultar al pasar el ratón: o se lee, o no existe.
 */
export function seccionFacturasPendientes(
  invoices: ReceivableRow[],
  saldoTotal: number,
): PdfSection {
  const hayMigradas = invoices.some((i) => i.origen === "alegra");
  return {
    title: "Facturas pendientes",
    table: {
      columns: [
        { header: "Factura", key: "number" },
        { header: "Origen", key: "origen" },
        { header: "e-CF", key: "ecf" },
        { header: "Emisión", key: "issued", format: "date" },
        { header: "Vence", key: "due", format: "date" },
        { header: "Días venc.", key: "overdue", format: "int", align: "right" },
        { header: "Monto", key: "total", format: "currency", align: "right" },
        { header: "Saldo", key: "balance", format: "currency", align: "right" },
        { header: "Estado", key: "estado" },
      ],
      rows: invoices.map((i) => ({
        number: i.number,
        origen: i.origen === "alegra" ? "Migrada de Alegra" : "Sistema",
        ecf: i.ecfNumber ?? "—",
        issued: i.issuedAt,
        due: i.dueDate,
        overdue: i.overdueDays,
        total: i.total,
        balance: i.balance,
        estado: AGING_LABEL[i.bucket],
      })),
      totals: { number: "TOTAL", balance: saldoTotal },
      emptyMessage: "Sin facturas pendientes.",
    },
    // `footnote` es la clave que el motor de PDF entiende (`PdfSection`); una
    // `note` dentro de `table` se descarta en silencio.
    ...(hayMigradas
      ? {
          footnote:
            "Las facturas marcadas «Migrada de Alegra» proceden del sistema anterior: " +
            "su pago se registra en Alegra, no en DermaLand.",
        }
      : {}),
  };
}
