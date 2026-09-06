// Portada de agendapp: tests/unit/dgii-nota-que-modifica-v612.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  describirNotaQueModifica,
  titularDeNotasQueModifican,
  type NotaQueModifica,
} from "./nota-que-modifica";

/**
 * v612 — Lo que una nota le hizo de verdad al comprobante.
 *
 * v584 añadió el bloque que avisa de que una nota modificó al original —el caso real de
 * `E340000000001` sobre `E310000000001`— y lo hizo decidiendo el texto dentro del JSX,
 * comparando sólo importes. De ahí salieron tres afirmaciones que pueden ser falsas:
 *
 *  1. Toda fila se anuncia como «nota de crédito», pero `reference_e_ncf` es también cómo
 *     una nota de DÉBITO (tipo 33) apunta a su original. Una nota de débito por el importe
 *     completo se leía «cubre el total, así que lo anula ante la DGII», cuando una nota de
 *     débito aumenta lo que se debe: no anula nada.
 *  2. Una nota todavía sin enviar —o enviada y sin respuesta— se presentaba como un hecho
 *     consumado ante la DGII, que no ha visto nada.
 *  3. «Cubre el total» se decidía con `toFixed(2)` sobre dos números en coma flotante.
 *
 * El texto es una conclusión fiscal sobre un acto público. Vive fuera del componente y
 * con casos, no dentro de un ternario.
 */

const nota = (over: Partial<NotaQueModifica> = {}): NotaQueModifica => ({
  eNcf: "E340000000001",
  tipo: "34",
  estado: "accepted",
  total: "100",
  ...over,
});

describe("v612 — una nota de crédito aceptada", () => {
  it("por el total: anula el comprobante ante la DGII", () => {
    const d = describirNotaQueModifica(nota(), "100");
    expect(d.anula).toBe(true);
    expect(d.detalle).toContain("anula");
    expect(d.detalle).toContain("DGII");
  });

  it("por menos del total: lo corrige, no lo anula", () => {
    const d = describirNotaQueModifica(nota({ total: "40" }), "100");
    expect(d.anula).toBe(false);
    expect(d.detalle).not.toContain("anula");
    expect(d.detalle).toMatch(/corrige/i);
  });
});

describe("v612 — una nota de DÉBITO no anula nada", () => {
  /**
   * El caso que v584 pintaba al revés. `ORIGEN_DOCUMENTAL["33"]` la emite «con referencia
   * obligatoria», así que esta fila es alcanzable hoy.
   */
  it("aunque su importe cubra el total, no dice que anula", () => {
    const d = describirNotaQueModifica(nota({ tipo: "33", eNcf: "E330000000001" }), "100");
    expect(d.anula, "una nota de débito nunca anula el original").toBe(false);
    expect(d.detalle).not.toMatch(/anula/i);
  });

  it("y dice lo que de verdad hace: aumentar lo que se debe", () => {
    const d = describirNotaQueModifica(nota({ tipo: "33" }), "100");
    expect(d.detalle).toMatch(/aumenta|más/i);
  });

  it("se nombra nota de débito, no de crédito", () => {
    expect(describirNotaQueModifica(nota({ tipo: "33" }), "100").titular).toMatch(/débito/i);
    expect(describirNotaQueModifica(nota({ tipo: "34" }), "100").titular).toMatch(/crédito/i);
  });
});

describe("v612 — una nota que la DGII todavía no ha juzgado", () => {
  it("enviada sin respuesta: no se presenta como hecho consumado", () => {
    const d = describirNotaQueModifica(nota({ estado: "submitted" }), "100");
    expect(d.anula, "sin veredicto no se puede afirmar que anuló").toBe(false);
    expect(d.detalle).toMatch(/todavía|aún|sin respuesta/i);
    expect(d.detalle).not.toMatch(/lo anula ante la DGII/);
  });

  it("en proceso: igual", () => {
    expect(describirNotaQueModifica(nota({ estado: "in_process" }), "100").anula).toBe(false);
  });

  it("aceptada con condiciones: cuenta, y se dice", () => {
    const d = describirNotaQueModifica(nota({ estado: "accepted_conditional" }), "100");
    expect(d.anula).toBe(true);
    expect(d.detalle).toMatch(/condicion/i);
  });
});

describe("v612 — el importe se compara en céntimos, no en coma flotante", () => {
  it("0.1 + 0.2 contra 0.3 se considera el total", () => {
    // `(0.1+0.2).toFixed(2) === (0.3).toFixed(2)` acierta por poco; comparar en enteros
    // lo hace por construcción. El caso importa: decide si el texto dice «anula».
    const d = describirNotaQueModifica(nota({ total: String(0.1 + 0.2) }), "0.3");
    expect(d.anula).toBe(true);
  });

  it("un céntimo de menos ya no es el total", () => {
    expect(describirNotaQueModifica(nota({ total: "99.99" }), "100").anula).toBe(false);
  });

  it("un importe que no convierte no inventa un veredicto", () => {
    // Regla del proyecto: nunca dejar pasar un NaN. Sin importe fiable no se afirma nada.
    const d = describirNotaQueModifica(nota({ total: "" }), "100");
    expect(d.anula).toBe(false);
    expect(d.detalle).not.toMatch(/anula/i);
  });
});

describe("v612 — el titular del bloque", () => {
  it("una sola nota de crédito", () => {
    expect(titularDeNotasQueModifican([nota()])).toMatch(/^Una nota de crédito/);
  });

  it("varias del mismo tipo se cuentan", () => {
    expect(titularDeNotasQueModifican([nota(), nota({ eNcf: "E340000000002" })])).toMatch(/^2 notas de crédito/);
  });

  it("mezcladas no se llaman todas de crédito", () => {
    const t = titularDeNotasQueModifican([nota(), nota({ tipo: "33", eNcf: "E330000000001" })]);
    expect(t).not.toMatch(/2 notas de crédito/);
    expect(t).toMatch(/2 notas/);
  });
});

// ── El aviso que se perdía por el camino ──
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { rutaPortada, leerSiExiste } from "./__port__/rutas";

// PENDIENTE fase 3 (persistencia y orquestacion): el bloque entero guarda src/lib/dgii/submission-service.ts, que DermaLand aún no tiene.
describe.skip("v612 — los avisos del envío se acumulan, no se reemplazan", () => {
  const src = leerSiExiste("src/lib/dgii/submission-service.ts");

  it("nada reasigna `avisosDelEnvio` a otro array", () => {
    /**
     * v584 añadió un aviso cuando falla guardar la respuesta de la DGII, para que perder
     * la única prueba de lo que contestó dejara de ser mudo. Cien líneas más abajo,
     * `avisosDelEnvio = avisos` reemplazaba el array entero y ese aviso desaparecía antes
     * de llegar a quien cobra. El arreglo se deshacía solo, y su test —un grep de
     * «avisos|warnings»— pasaba igual.
     */
    expect(src, "una reasignación descarta lo acumulado antes").not.toMatch(
      /avisosDelEnvio\s*=\s*avisos\s*;/,
    );
    expect(src).toMatch(/avisosDelEnvio\s*=\s*\[\s*\.\.\.avisosDelEnvio\s*,\s*\.\.\.avisos\s*\]/);
  });

  it("y el fallo de storage sigue empujando al array que se devuelve", () => {
    const iPush = src.indexOf("avisosDelEnvio.push(");
    const iReturn = src.lastIndexOf("warnings: avisosDelEnvio");
    expect(iPush, "ya no se avisa del fallo de storage").toBeGreaterThan(-1);
    expect(iReturn, "no se devuelven los avisos").toBeGreaterThan(iPush);
  });
});
