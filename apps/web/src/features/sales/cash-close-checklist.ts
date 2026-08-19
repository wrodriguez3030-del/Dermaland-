/**
 * Qué queda abierto en el turno antes de cerrar caja.
 *
 * Las ventas cobradas quedan finalizadas en el POS al cobrarlas
 * (`emit_sale_atomic`); el cierre no las "ejecuta". Lo que SÍ debe pasar en el
 * cierre es que nada quede abierto sin que el cajero lo sepa:
 *
 *  - un BORRADOR a esta hora es casi seguro un olvido → se avisa;
 *  - lo emitido con balance es una venta A CRÉDITO: legítima, queda en
 *    Cuentas por Cobrar → se informa, no se bloquea;
 *  - anuladas y vencidas no cuentan para nada.
 *
 * Pura y probada; la pantalla decide cómo pintarlo.
 */

export interface CloseChecklistSale {
  status: string;
  total: number;
  balance: number;
}

export interface CloseChecklist {
  /** Ventas cobradas del todo (finalizadas). */
  settled: number;
  drafts: number;
  draftsTotal: number;
  /** Emitidas con balance: quedan en CxC. */
  credit: number;
  creditTotal: number;
  /** Sin borradores ni crédito pendiente. */
  allSettled: boolean;
}

const IGNORADAS = new Set(["cancelled", "expired"]);

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

export function closeChecklist(sales: CloseChecklistSale[]): CloseChecklist {
  let settled = 0;
  let drafts = 0;
  let draftsTotal = 0;
  let credit = 0;
  let creditTotal = 0;

  for (const s of sales) {
    if (IGNORADAS.has(s.status)) continue;
    if (s.status === "draft") {
      drafts += 1;
      draftsTotal += s.total;
      continue;
    }
    if (s.balance > 0) {
      credit += 1;
      creditTotal += s.balance;
      continue;
    }
    settled += 1;
  }

  return {
    settled,
    drafts,
    draftsTotal: round2(draftsTotal),
    credit,
    creditTotal: round2(creditTotal),
    allSettled: drafts === 0 && credit === 0,
  };
}
