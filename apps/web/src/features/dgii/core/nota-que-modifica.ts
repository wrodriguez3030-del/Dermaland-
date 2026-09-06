/**
 * v612 — Qué le hizo una nota al comprobante que referencia.
 *
 * `electronic_invoices.reference_e_ncf` apunta de la nota a su original. v584 usó ese dato
 * para avisar en el panel de que a un comprobante aceptado lo había modificado una nota
 * —el caso real de `E340000000001` sobre `E310000000001`— pero decidió el texto dentro del
 * JSX, comparando importes con `toFixed(2)`. Eso producía tres afirmaciones que pueden ser
 * falsas sobre un acto público:
 *
 *  - Llamaba «nota de crédito» a toda fila, aunque una nota de DÉBITO (tipo 33) referencia
 *    a su original por el mismo campo. Y a una de débito por el importe completo le decía
 *    «lo anula ante la DGII», cuando una nota de débito aumenta lo que se debe.
 *  - Daba por hecha ante la DGII una nota que quizá no se había enviado todavía.
 *  - Comparaba importes en coma flotante para decidir si «cubre el total».
 *
 * Por eso vive acá, con casos, y no en el componente: es una conclusión fiscal.
 */

export type NotaQueModifica = {
  eNcf: string;
  /** Tipo e-CF de la nota: "34" crédito, "33" débito. */
  tipo: string;
  /** Estado interno de la nota en la app. */
  estado: string;
  /** Importe, tal como viene de la base. */
  total: string;
};

export type DescripcionDeNota = {
  /** Cómo se nombra la nota. */
  titular: string;
  /** Qué le hizo al comprobante, en una frase. */
  detalle: string;
  /** Si el original quedó anulado ante la DGII. Sólo una nota de crédito, aceptada y por el total. */
  anula: boolean;
};

/** Estados en que la DGII ya emitió un veredicto favorable. */
const CON_VEREDICTO = new Set(["accepted", "accepted_conditional"]);

/**
 * Importe a céntimos enteros. Devuelve `null` si no convierte: sin importe fiable no se
 * afirma nada, en vez de dejar correr un `NaN` que acabaría escrito en la pantalla.
 */
function centimos(valor: string): number | null {
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function nombreDeTipoDeNota(tipo: string): string {
  if (tipo === "33") return "nota de débito";
  if (tipo === "34") return "nota de crédito";
  return "nota";
}

/** El plural va en «notas», no al final: «notas de crédito», nunca «nota de créditos». */
export function nombreDeTipoDeNotaEnPlural(tipo: string): string {
  if (tipo === "33") return "notas de débito";
  if (tipo === "34") return "notas de crédito";
  return "notas";
}

export function describirNotaQueModifica(nota: NotaQueModifica, totalOriginal: string): DescripcionDeNota {
  const nombre = nombreDeTipoDeNota(nota.tipo);
  const titular = nombre.charAt(0).toUpperCase() + nombre.slice(1);

  const dela = centimos(nota.total);
  const del = centimos(totalOriginal);
  const cubreElTotal = dela !== null && del !== null && dela === del;

  // Sin veredicto de la DGII no hay nada consumado que contar.
  if (!CON_VEREDICTO.has(nota.estado)) {
    return {
      titular,
      detalle: "todavía sin respuesta de la DGII, así que no cambia nada por ahora",
      anula: false,
    };
  }

  const conCondiciones = nota.estado === "accepted_conditional";
  const coletilla = conCondiciones ? " (aceptada con condiciones)" : "";

  // Una nota de débito aumenta lo que se debe: no anula ni corrige a la baja.
  if (nota.tipo === "33") {
    return {
      titular,
      detalle: `aumenta lo que se debe por este comprobante${coletilla}`,
      anula: false,
    };
  }

  if (cubreElTotal) {
    return {
      titular,
      detalle: `cubre el total, así que lo anula ante la DGII${coletilla}`,
      anula: true,
    };
  }

  return {
    titular,
    detalle: dela === null ? `lo modifica${coletilla}` : `lo corrige por ese importe${coletilla}`,
    anula: false,
  };
}

/** El encabezado del bloque: no llama «de crédito» a un grupo que trae una de débito. */
export function titularDeNotasQueModifican(notas: NotaQueModifica[]): string {
  if (notas.length === 0) return "";
  const tipos = new Set(notas.map((n) => n.tipo));

  if (notas.length === 1) {
    return `Una ${nombreDeTipoDeNota(notas[0]!.tipo)} modificó este comprobante`;
  }
  if (tipos.size === 1) {
    return `${notas.length} ${nombreDeTipoDeNotaEnPlural(notas[0]!.tipo)} modificaron este comprobante`;
  }
  return `${notas.length} notas modificaron este comprobante`;
}
