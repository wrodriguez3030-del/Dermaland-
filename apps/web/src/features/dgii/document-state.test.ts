import { describe, expect, it } from "vitest";
import {
  canTransition,
  ECF_STATUSES,
  evaluateTransition,
  isAuthorized,
  isMutable,
  isTerminal,
  nextStatuses,
  statusLabel,
  type EcfStatus,
} from "./document-state";

describe("un documento autorizado no retrocede", () => {
  it("una respuesta que llega tarde NO devuelve a enviado", () => {
    // El fallo clásico al hablar con un tercero: la red no entrega en orden.
    // La consulta por trackId se cruza con el acuse y llega después.
    for (const autorizado of ["accepted", "accepted_conditional"] as const) {
      const r = evaluateTransition(autorizado, "submitted");
      expect(r.ok, autorizado).toBe(false);
      if (!r.ok) expect(r.reason).toBe("fuera-de-orden");
    }
  });

  it("tampoco lo devuelve a en proceso, ni a error, ni a rechazado", () => {
    for (const destino of ["in_process", "error", "rejected", "cancelled"] as const) {
      const r = evaluateTransition("accepted", destino);
      expect(r.ok, destino).toBe(false);
    }
  });

  it("lo ÚNICO que le puede pasar es quedar sustituido", () => {
    expect(canTransition("accepted", "voided")).toBe(true);
    expect(nextStatuses("accepted")).toEqual(["voided"]);
  });
});

describe("la misma respuesta dos veces no es un error", () => {
  it("repetir el estado se marca como duplicada, no como inválida", () => {
    // La DGII puede responder dos veces. Si eso pintara una alarma, la pantalla
    // se llenaría de alarmas por cosas normales y nadie miraría ninguna.
    for (const s of ECF_STATUSES) {
      const r = evaluateTransition(s, s);
      expect(r.ok, s).toBe(false);
      if (!r.ok) expect(r.reason, s).toBe("duplicada");
    }
  });
});

describe("el camino normal", () => {
  it("borrador → generado → validado → firmado → enviado → aceptado", () => {
    const camino: EcfStatus[] = [
      "draft",
      "generated",
      "validated",
      "signed",
      "submitted",
      "accepted",
    ];
    for (let i = 0; i < camino.length - 1; i++) {
      const r = evaluateTransition(camino[i]!, camino[i + 1]!);
      expect(r.ok, `${camino[i]} → ${camino[i + 1]}`).toBe(true);
    }
  });

  it("la DGII puede dejarlo en proceso antes de resolver", () => {
    expect(canTransition("submitted", "in_process")).toBe(true);
    expect(canTransition("in_process", "accepted")).toBe(true);
    expect(canTransition("in_process", "rejected")).toBe(true);
  });

  it("no se puede firmar lo que no pasó el XSD", () => {
    // Nunca enviar a DGII un XML que no pase validación local (§14).
    expect(canTransition("generated", "signed")).toBe(false);
    expect(canTransition("draft", "signed")).toBe(false);
  });

  it("no se puede enviar lo que no está firmado", () => {
    expect(canTransition("validated", "submitted")).toBe(false);
  });
});

describe("error frente a rechazo: no son lo mismo", () => {
  it("un error NUESTRO se reintenta desde donde estaba", () => {
    // Se cayó la red, no cargó el certificado. El documento no está quemado.
    for (const destino of ["generated", "validated", "signed", "submitted"] as const) {
      expect(canTransition("error", destino), destino).toBe(true);
    }
  });

  it("un rechazo de la DGII es definitivo", () => {
    // Lo que corresponde es corregir y emitir otro, no reintentar el mismo.
    expect(isTerminal("rejected")).toBe(true);
    expect(nextStatuses("rejected")).toEqual([]);
  });

  it("no se reintenta automáticamente un rechazo fiscal", () => {
    const r = evaluateTransition("rejected", "submitted");
    expect(r.ok).toBe(false);
  });
});

describe("anular", () => {
  it("se puede antes de entregarlo a la DGII", () => {
    for (const s of ["draft", "generated", "validated", "signed"] as const) {
      expect(canTransition(s, "cancelled"), s).toBe(true);
    }
  });

  it("YA NO se puede una vez entregado: ahí decide la DGII", () => {
    expect(canTransition("submitted", "cancelled")).toBe(false);
    expect(canTransition("in_process", "cancelled")).toBe(false);
    expect(canTransition("accepted", "cancelled")).toBe(false);
  });
});

describe("editar el contenido", () => {
  it("desde que se firma, el documento no se toca", () => {
    // El XML firmado ES el documento: cambiar un dato invalida la firma y no se
    // nota hasta que la DGII lo rechaza.
    for (const s of ["signed", "submitted", "in_process", "accepted"] as const) {
      expect(isMutable(s), s).toBe(false);
    }
  });

  it("antes de firmar, sí", () => {
    for (const s of ["draft", "generated", "validated"] as const) {
      expect(isMutable(s), s).toBe(true);
    }
  });
});

describe("integridad de la máquina", () => {
  it("son los doce del CHECK de la base, sin repetir", () => {
    expect(ECF_STATUSES).toHaveLength(12);
    expect(new Set(ECF_STATUSES).size).toBe(12);
  });

  it("todo estado tiene transiciones definidas y etiqueta legible", () => {
    for (const s of ECF_STATUSES) {
      expect(Array.isArray(nextStatuses(s)), s).toBe(true);
      const etiqueta = statusLabel(s);
      expect(etiqueta.length, s).toBeGreaterThan(0);
      expect(etiqueta, s).not.toBe(s);
    }
  });

  it("ninguna transición apunta a un estado que no existe", () => {
    const validos = new Set<string>(ECF_STATUSES);
    for (const s of ECF_STATUSES) {
      for (const destino of nextStatuses(s)) {
        expect(validos.has(destino), `${s} → ${destino}`).toBe(true);
      }
    }
  });

  it("ningún estado se apunta a sí mismo: eso lo cubre 'duplicada'", () => {
    for (const s of ECF_STATUSES) {
      expect(nextStatuses(s).includes(s), s).toBe(false);
    }
  });

  it("todos los estados son alcanzables desde borrador", () => {
    // Un estado inalcanzable es código muerto que alguien creerá que funciona.
    const vistos = new Set<EcfStatus>(["draft"]);
    let creció = true;
    while (creció) {
      creció = false;
      for (const s of [...vistos]) {
        for (const d of nextStatuses(s)) {
          if (!vistos.has(d)) {
            vistos.add(d);
            creció = true;
          }
        }
      }
    }
    expect([...ECF_STATUSES].filter((s) => !vistos.has(s))).toEqual([]);
  });

  it("solo aceptado y aceptado-con-observaciones cuentan como autorizados", () => {
    expect(ECF_STATUSES.filter((s) => isAuthorized(s))).toEqual([
      "accepted",
      "accepted_conditional",
    ]);
  });
});
