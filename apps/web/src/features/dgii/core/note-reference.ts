import "server-only";

import { RFCE_MONTO_MAXIMO } from "./builders/rfce";

/**
 * v354 — Referencia persistida y "saldo afectable" de notas 33/34.
 *
 * Feature-detect de la columna `electronic_invoices.reference_e_ncf`
 * (migración `applied/20260710_dgii_invoice_note_reference.sql` — APLICADA en
 * producción 2026-07-13 con autorización, v360; el feature-detect se conserva
 * para entornos sin la columna):
 *  - SIN columna → la emisión de notas sigue funcionando igual que hoy y se
 *    agrega un WARNING honesto (cero bloqueo nuevo, cero regresión);
 *  - CON columna → la referencia se persiste en el comprobante nota y las
 *    notas de crédito (34) no pueden exceder el total del comprobante
 *    original: el original se lockea `FOR UPDATE` dentro de la MISMA
 *    transacción que reserva la secuencia, así dos notas concurrentes contra
 *    el mismo original quedan serializadas (la 2ª ve a la 1ª ya commiteada).
 *
 * Invariante Prisma (ref 153055095): la columna NO está declarada en
 * schema.prisma mientras la migración siga PENDING → todo acceso es SQL crudo.
 * El 33 (nota de débito) persiste referencia pero no reduce saldo.
 */

export const NOTE_REFERENCE_PENDING_WARNING =
  "No se pudo verificar cuánto queda por afectar con notas: falta la migración 20260710_dgii_invoice_note_reference en este entorno.";

/** Estructural mínimo: compatible con PrismaClient y con Prisma.TransactionClient. */
type RawDb = {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
};

/** ¿Existe la columna reference_e_ncf? (feature-detect, patrón fe-facade v340). */
export async function isNoteReferenceAvailable(db: RawDb): Promise<boolean> {
  try {
    await db.$queryRaw`SELECT reference_e_ncf FROM electronic_invoices LIMIT 0`;
    return true;
  } catch {
    return false;
  }
}

export type NoteBalanceCheck = { ok: true; warnings: string[] } | { ok: false; reason: string };

/**
 * Lockea el comprobante ORIGINAL del tenant (FOR UPDATE) y, para notas de
 * crédito (34), verifica que el total de la nota no exceda el saldo afectable
 * (total original − suma de 34 previas no anuladas contra ese eNCF).
 * Llamar DENTRO de la transacción de prepare, ANTES de reservar secuencia.
 */
export async function lockAndCheckNoteBalance(
  tx: RawDb,
  args: { businessId: string; ambiente: string; referencedENcf: string; tipoEcf: string; noteTotal: number },
): Promise<NoteBalanceCheck> {
  // Solo comprobantes ORIGINALES (la integridad nota-sobre-nota ya se bloqueó
  // en el pre-chequeo v354 slice 1; acá el filtro la hace también atómica).
  // v356 — filtro por ambiente: e_ncf es único por (business, ambiente); sin él,
  // un original testecf y uno ecf con el mismo string colisionaban (y el SUM
  // mezclaba notas de ambos ambientes en un solo saldo).
  const rows = await tx.$queryRaw<{ total: string }[]>`
    SELECT total::text AS total FROM electronic_invoices
    WHERE business_id = ${args.businessId}::uuid
      AND ambiente = ${args.ambiente}
      AND e_ncf = ${args.referencedENcf}
      AND tipo_ecf NOT IN ('33', '34')
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE`;
  if (!rows?.[0]) {
    return {
      ok: true,
      warnings: [
        `El comprobante referenciado (${args.referencedENcf}) no está registrado en AgendApp; el saldo afectable no se pudo verificar (original externo).`,
      ],
    };
  }
  if (args.tipoEcf !== "34") return { ok: true, warnings: [] };

  const prev = await tx.$queryRaw<{ s: string }[]>`
    SELECT COALESCE(SUM(total), 0)::text AS s FROM electronic_invoices
    WHERE business_id = ${args.businessId}::uuid
      AND ambiente = ${args.ambiente}
      AND reference_e_ncf = ${args.referencedENcf}
      AND tipo_ecf = '34'
      AND status NOT IN ('cancelled', 'rejected', 'error')`;
  const originalTotal = Number(rows[0].total);
  const notasPrevias = Number(prev?.[0]?.s ?? "0");
  const disponible = Math.round((originalTotal - notasPrevias) * 100) / 100;
  if (args.noteTotal > disponible + 0.005) {
    return {
      ok: false,
      reason:
        `La nota de crédito (RD$${args.noteTotal.toFixed(2)}) excede el saldo afectable del comprobante ` +
        `${args.referencedENcf}: original RD$${originalTotal.toFixed(2)}, notas de crédito previas ` +
        `RD$${notasPrevias.toFixed(2)}, disponible RD$${disponible.toFixed(2)}.`,
    };
  }
  return { ok: true, warnings: [] };
}

/** Persiste el eNCF referenciado en la nota recién creada (best-effort honesto). */
export async function persistNoteReference(tx: RawDb, invoiceId: string, referencedENcf: string): Promise<boolean> {
  try {
    await tx.$executeRaw`
      UPDATE electronic_invoices SET reference_e_ncf = ${referencedENcf}
      WHERE id = ${invoiceId}::uuid`;
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// v555 — RNC del comprador HEREDADO del documento de origen (notas 33/34)
// ─────────────────────────────────────────────────────────────────────────────

/** El comprobante ORIGINAL que la nota modifica, en lo que hace falta para decidir. */
export type OrigenNota = {
  tipoEcf: string;
  /** Total del original, en pesos. */
  total: number;
};

export type ExigenciaRnc = { exige: false } | { exige: true; motivo: string };

/**
 * Tipos en los que el comprador SIEMPRE está identificado con RNC. Una nota
 * contra uno de ellos hereda esa obligación: el documento que la nota modifica
 * tiene comprador fiscal, así que la nota también debe tenerlo.
 */
const ORIGENES_CON_RNC_OBLIGATORIO = new Set(["31", "41", "45"]);

/**
 * ¿La nota 33/34 exige RNC del comprador por el documento que modifica?
 *
 * La regla es de la norma de DGII, no del XSD —por eso `builder.ts`, que deriva
 * cada nodo del XSD, no la tenía—. Quedó identificada en `V498_ESTUDIO_L10N_DO_EDI.md`
 * y siguió abierta hasta acá: es el último pendiente de aquel estudio.
 *
 * Exige RNC cuando el origen fue **31, 41 o 45**, o fue un **32 que llegó al tope**
 * de RD$250.000 — por encima de ese monto la factura de consumo deja de ser
 * anónima y su nota tampoco puede serlo.
 *
 * ── Origen desconocido → NO exige ───────────────────────────────────────────
 * Si el original no vive en AgendApp (pre-AgendApp, u otro software del mismo
 * emisor) devuelve `false`. Es la misma postura que ya tiene el chequeo de
 * integridad referencial de v354: DGII no exige que el original viva acá, y
 * bloquear por lo que no podemos ver dejaría al dueño sin poder emitir una nota
 * legítima.
 *
 * ── Lo que NO cubre ─────────────────────────────────────────────────────────
 * La norma añade «o si es una devolución». Eso no se implementa: AgendApp tiene
 * módulo de devoluciones y decidir cuál nota lo es exigiría una inferencia que
 * hoy no se puede hacer sin adivinar. Adivinar acá bloquearía notas legítimas,
 * que es peor que no cubrir el caso. Queda dicho, no escondido.
 */
export function exigeRncCompradorEnNota(origen: OrigenNota | null | undefined): ExigenciaRnc {
  if (!origen) return { exige: false };

  if (ORIGENES_CON_RNC_OBLIGATORIO.has(origen.tipoEcf)) {
    return {
      exige: true,
      motivo: `el comprobante que modifica es un tipo ${origen.tipoEcf}, que siempre lleva RNC del comprador`,
    };
  }

  // El tope se importa de su dueño canónico (`builders/rfce.ts`) en vez de
  // redeclararse: es el MISMO umbral de DGII que decide íntegro vs. resumen, y
  // v553 dejó dicho que una segunda copia acabaría mintiendo. Si algún día DGII
  // separa los dos umbrales, éste es el punto donde se parten.
  // El total tiene que ser un número de verdad. Sin esta guarda, un `total`
  // ausente o ilegible entra como NaN y la comparación da `false` por accidente
  // — el resultado correcto, pero por la razón equivocada y sin dejar rastro.
  const totalConocido = Number.isFinite(origen.total);

  if (origen.tipoEcf === "32" && totalConocido && origen.total >= RFCE_MONTO_MAXIMO) {
    return {
      exige: true,
      motivo: `el comprobante que modifica es una factura de consumo de RD$${origen.total.toFixed(2)}, que llega al tope de RD$${RFCE_MONTO_MAXIMO.toLocaleString("es-DO")}`,
    };
  }

  return { exige: false };
}
