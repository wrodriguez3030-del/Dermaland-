import type { InvoiceStatus } from "./submission-state-types";

/**
 * v577 — Qué estado le queda a un comprobante justo después de enviarlo.
 *
 * ── Lo que pasaba ───────────────────────────────────────────────────────────────────
 * `submission-service.ts` escribía `status: "submitted"` FIJO, pasara lo que pasara. El
 * cliente ya clasificaba la respuesta de la DGII en `result.status` —con «accepted»,
 * «rejected» y los demás— y ese valor se usaba para el log, para la auditoría y para
 * decidir el `error_message`… pero no para el estado del comprobante.
 *
 * ── A quién le costó ────────────────────────────────────────────────────────────────
 * A las once Facturas de Consumo de este negocio (E32…001 a E32…011). Un E32 bajo
 * RD$250,000 se envía como resumen RFCE a fc.dgii.gov.do, que acepta en el acto y NO
 * devuelve TrackId: así está diseñado. Las once tienen «200 · Aceptado» en su bitácora
 * desde el 17 y el 22 de agosto, y las once seguían en «submitted», porque el resolutor
 * de veredictos sólo consulta lo que tiene TrackId. De ahí no podían salir nunca.
 *
 * ── Por qué no se promueve todo ─────────────────────────────────────────────────────
 * «error» se queda en «submitted» a propósito: sacarlo de ahí lo dejaría fuera del
 * resolutor y fuera de la red del cierre de caja, y eso es un cambio de comportamiento
 * aparte. Y cualquier valor que no conozcamos cae en «submitted», nunca en «accepted»:
 * inventar una aceptación es el error caro de este sistema.
 *
 * Sin I/O.
 */

/** Veredictos que la respuesta del envío puede traer ya resueltos. */
const VEREDICTOS_EN_LA_RESPUESTA: ReadonlySet<string> = new Set([
  "accepted",
  "accepted_conditional",
  "rejected",
  "in_process",
]);

export function estadoTrasEnvio(resultado: {
  status: string;
  trackId: string | null;
  /** Lo que la DGII dijo. Evidencia, no un permiso: v581. */
  messages?: string[];
  code?: string | null;
}): InvoiceStatus {
  if (!VEREDICTOS_EN_LA_RESPUESTA.has(resultado.status)) return "submitted";

  /**
   * v581 — Última puerta antes de escribir un estado TERMINAL.
   *
   * `rejected` no se reenvía, deja de congelar los pagos de la venta y le dice al dueño que
   * su número ya se consumió. Un 400 de proxy o de WAF llegaba aquí como «rejected» sin que
   * la DGII hubiera visto el documento, y sin TrackId no hay forma de comprobarlo después:
   * quemaba un número autorizado que no se devuelve.
   *
   * El normalizer ya lo corta en origen; esto es la segunda puerta, por si otro camino
   * empieza a producir rechazos mañana. Se pide evidencia: o un TrackId —prueba de que la
   * DGII recibió y evaluó el documento— o que haya dicho algo, con su código o sus
   * mensajes. Sin nada de eso el comprobante se queda en `submitted`, que es reintentable.
   */
  if (resultado.status === "rejected") {
    const dijoAlgo = (resultado.messages?.length ?? 0) > 0 || (resultado.code ?? null) !== null;
    if (!resultado.trackId && !dijoAlgo) return "submitted";
  }

  return resultado.status as InvoiceStatus;
}
