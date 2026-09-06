import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Los XSD son la ley: si uno no es el oficial de la DGII, todo lo que este
 * módulo valide es mentira. `SOURCE.md` declara el SHA-256 de cada uno tal
 * como se descargó de dgii.gov.do; esta prueba comprueba que el fichero que
 * hay en el repositorio sigue siendo ése.
 *
 * Portado de agendapp (2026-09-05) junto con los esquemas.
 */

const DIR = __dirname;

/** Lee `SOURCE.md` y saca los pares `fichero → sha256` de sus tablas. */
function huellasDeclaradas(): Map<string, string> {
  const md = readFileSync(path.join(DIR, "SOURCE.md"), "utf8");
  const mapa = new Map<string, string>();
  // Filas tipo: | 31 | `e-CF-31-v1.0.xsd` | 16/10/2025 | 123019 | `6f29…` |
  const re = /`([A-Za-z0-9.\-]+\.xsd)`[^|]*\|[^|]*\|[^|]*\|\s*`([0-9a-f]{64})`/g;
  for (const m of md.matchAll(re)) mapa.set(m[1]!, m[2]!);
  return mapa;
}

function sha256(fichero: string): string {
  return createHash("sha256").update(readFileSync(path.join(DIR, fichero))).digest("hex");
}

describe("esquemas oficiales de la DGII", () => {
  const declaradas = huellasDeclaradas();
  const enDisco = readdirSync(DIR).filter((f) => f.endsWith(".xsd")).sort();

  it("están los 14 esquemas que el módulo necesita", () => {
    expect(enDisco).toEqual([
      "ACECF-v1.0.xsd",
      "ANECF-v1.0.xsd",
      "ARECF-v1.0.xsd",
      "RFCE-32-v1.0.xsd",
      "e-CF-31-v1.0.xsd",
      "e-CF-32-v1.0.xsd",
      "e-CF-33-v1.0.xsd",
      "e-CF-34-v1.0.xsd",
      "e-CF-41-v1.0.xsd",
      "e-CF-43-v1.0.xsd",
      "e-CF-44-v1.0.xsd",
      "e-CF-45-v1.0.xsd",
      "e-CF-46-v1.0.xsd",
      "e-CF-47-v1.0.xsd",
    ]);
  });

  it("SOURCE.md declara la huella de al menos los tipos que DermaLand emite", () => {
    // 31 (crédito fiscal), 32 (consumo) y 34 (nota de crédito) son los que el
    // negocio usa; el resto se portan pero no se cablean.
    for (const f of ["e-CF-31-v1.0.xsd", "e-CF-32-v1.0.xsd", "e-CF-34-v1.0.xsd"]) {
      expect(declaradas.has(f), `SOURCE.md no declara la huella de ${f}`).toBe(true);
    }
  });

  it("cada fichero coincide con la huella declarada: son los oficiales, sin retocar", () => {
    const fallos: string[] = [];
    for (const [fichero, esperada] of declaradas) {
      if (!enDisco.includes(fichero)) {
        fallos.push(`${fichero}: declarado en SOURCE.md pero no está en disco`);
        continue;
      }
      const real = sha256(fichero);
      if (real !== esperada) fallos.push(`${fichero}: esperado ${esperada.slice(0, 12)}… y es ${real.slice(0, 12)}…`);
    }
    expect(fallos, fallos.join(" · ")).toEqual([]);
  });

  it("ninguno está vacío ni truncado", () => {
    for (const f of enDisco) {
      const bytes = readFileSync(path.join(DIR, f)).length;
      expect(bytes, `${f} pesa ${bytes} bytes`).toBeGreaterThan(2000);
    }
  });
});
