import { describe, expect, it } from "vitest";
import { ECF_STATUSES, type EcfStatus } from "./document-state";
import {
  actionFor,
  isDue,
  LOTE_MAXIMO,
  pickBatch,
  type QueueCandidate,
} from "./queue-policy";

const AHORA = new Date("2026-08-04T20:00:00Z");

function doc(p: Partial<QueueCandidate> = {}): QueueCandidate {
  return {
    id: "a",
    status: "signed",
    nextRetryAt: null,
    retryCount: 0,
    createdAt: "2026-08-04T19:00:00Z",
    ...p,
  };
}

describe("la cita se respeta", () => {
  it("un documento citado para dentro de un rato NO se toca", () => {
    // Saltarse la espera anula el backoff entero y convierte la cola en un
    // martillo contra la DGII.
    expect(isDue(doc({ nextRetryAt: "2026-08-04T20:05:00Z" }), AHORA)).toBe(false);
  });

  it("cuando llega la hora, sí", () => {
    expect(isDue(doc({ nextRetryAt: "2026-08-04T19:59:00Z" }), AHORA)).toBe(true);
    expect(isDue(doc({ nextRetryAt: "2026-08-04T20:00:00Z" }), AHORA)).toBe(true);
  });

  it("sin cita, le toca ya", () => {
    expect(isDue(doc({ nextRetryAt: null }), AHORA)).toBe(true);
  });

  it("una fecha ilegible no bloquea un documento para siempre", () => {
    // Peor que reintentar de más es que una venta se quede sin comprobante
    // porque una fecha se guardó mal.
    expect(isDue(doc({ nextRetryAt: "no es una fecha" }), AHORA)).toBe(true);
  });
});

describe("qué NO coge la cola", () => {
  it("nada terminal", () => {
    for (const s of ["accepted", "accepted_conditional", "rejected", "cancelled", "voided"] as const) {
      expect(isDue(doc({ status: s }), AHORA), s).toBe(false);
    }
  });

  it("un borrador todavía no: le falta el XML", () => {
    expect(isDue(doc({ status: "draft" }), AHORA)).toBe(false);
  });

  it("todo estado del sistema tiene una decisión tomada", () => {
    // Un estado sin decidir es un documento que se queda quieto sin que nadie
    // sepa por qué.
    for (const s of ECF_STATUSES) {
      const procesable = isDue(doc({ status: s }), AHORA);
      const accion = actionFor(s);
      expect(procesable === (accion !== null), s).toBe(true);
    }
  });
});

describe("qué se le hace a cada uno", () => {
  it("enviado y en proceso se CONSULTAN, no se reenvían", () => {
    // Reenviar duplicaría el comprobante: es el error que no se puede cometer.
    expect(actionFor("submitted")).toBe("consultar");
    expect(actionFor("in_process")).toBe("consultar");
  });

  it("el camino de ida", () => {
    expect(actionFor("generated")).toBe("validar");
    expect(actionFor("validated")).toBe("firmar");
    expect(actionFor("signed")).toBe("enviar");
  });
});

describe("el orden del lote", () => {
  it("primero el que más lleva esperando", () => {
    // Sin esto, un pico de comprobantes nuevos deja atrás a los viejos y uno
    // con mala suerte se queda al final de la fila para siempre.
    const lote = pickBatch(
      [
        doc({ id: "nuevo", createdAt: "2026-08-04T19:50:00Z" }),
        doc({ id: "viejo", createdAt: "2026-08-04T10:00:00Z" }),
        doc({ id: "medio", createdAt: "2026-08-04T15:00:00Z" }),
      ],
      { now: AHORA },
    );
    expect(lote.map((d) => d.id)).toEqual(["viejo", "medio", "nuevo"]);
  });

  it("a igualdad de antigüedad, primero el que menos ha fallado", () => {
    const lote = pickBatch(
      [
        doc({ id: "castigado", retryCount: 4 }),
        doc({ id: "fresco", retryCount: 0 }),
      ],
      { now: AHORA },
    );
    expect(lote[0]!.id).toBe("fresco");
  });
});

describe("el tamaño del lote", () => {
  it("no se pasa del tope aunque se lo pidan", () => {
    // Una función de Vercel tiene techo de tiempo. Vale más terminar diez de
    // verdad que empezar cien y morir a la mitad.
    const muchos = Array.from({ length: 200 }, (_, i) => doc({ id: String(i) }));
    expect(pickBatch(muchos, { now: AHORA, limit: 500 })).toHaveLength(LOTE_MAXIMO);
  });

  it("se puede pedir menos", () => {
    const muchos = Array.from({ length: 50 }, (_, i) => doc({ id: String(i) }));
    expect(pickBatch(muchos, { now: AHORA, limit: 3 })).toHaveLength(3);
  });

  it("un límite absurdo no revienta", () => {
    const algunos = [doc()];
    expect(pickBatch(algunos, { now: AHORA, limit: -1 })).toEqual([]);
  });

  it("sin candidatos, lote vacío", () => {
    expect(pickBatch([], { now: AHORA })).toEqual([]);
  });
});
