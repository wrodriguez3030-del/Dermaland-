// Portada de agendapp: tests/unit/dgii-portal-tracker-hardening-v342.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isValidDocumentReference } from "./enablement-types";
import { rutaPortada, leerSiExiste } from "./__port__/rutas";

/**
 * v342 — Tracker oficial DGII endurecido. Caso real 2026-07-09: dos pasos del
 * portal ("Registrado" y "Pruebas de Datos e-CF") quedaron marcados por clicks
 * de prueba; el dueño tuvo que revertirlos. v339 agregó la confirmación
 * contextual (client-side); v342 agrega el requisito SERVER-SIDE: marcar un
 * paso externo como realizado exige evidencia real (mismo criterio canónico
 * que las referencias documentales). Desmarcar queda libre. El estado externo
 * jamás se auto-infiere (firmar un XML no marca "postulación enviada").
 */

const readSrc = (rel: string) => readFileSync(rutaPortada(rel), "utf8");

// PENDIENTE fase 6 (pantallas y rutas API): el bloque entero guarda src/app/api/dgii/enablement/portal-step/route.ts, que DermaLand aún no tiene.
describe.skip("v342 — endpoint portal-step exige evidencia real al marcar done", () => {
  const route = leerSiExiste("src/app/api/dgii/enablement/portal-step/route.ts");

  it("valida la evidencia con el helper canónico ANTES de persistir; desmarcar no la exige", () => {
    expect(route).toMatch(/isValidDocumentReference/);
    expect(route).toMatch(/parsed\.data\.done && !isValidDocumentReference\(parsed\.data\.evidence\)/);
    expect(route.indexOf("isValidDocumentReference(parsed.data.evidence)")).toBeLessThan(
      route.indexOf("updatePortalStepMark("),
    );
  });

  it("el criterio canónico rechaza las evidencias que dejaron pasar las marcas de prueba", () => {
    for (const bad of [undefined, "", "N/A", "ok", "prueba", "click"]) {
      expect(isValidDocumentReference(bad)).toBe(false);
    }
    expect(isValidDocumentReference("Caso 76215 · portal DGII · 2026-07-09")).toBe(true);
  });
});

describe("v342 — el estado externo no se auto-infiere", () => {
  // PENDIENTE fase 6 (pantallas y rutas API): revive cuando exista src/app/api/dgii/certification/sign/route.ts.
  it.skip("solo el endpoint manual y la UI del tracker tocan las marcas (firmar/analizar NO marcan pasos)", () => {
    // El único escritor server-side es updatePortalStepMark, llamado únicamente
    // desde /api/dgii/enablement/portal-step (marca manual del dueño).
    for (const rel of [
      "src/app/api/dgii/certification/sign/route.ts",
      "src/app/api/dgii/certification/analyze/route.ts",
    ]) {
      const src = readSrc(rel);
      expect(src).not.toMatch(/updatePortalStepMark|portal-step|portalSteps/);
    }
  });

  // PENDIENTE fase 6 (pantallas y rutas API): revive cuando exista src/app/(dashboard)/settings/dgii/certification/_components/CertificationBridge.tsx.
  it.skip("la UI valida la evidencia antes de confirmar y la muestra en la confirmación", () => {
    const bridge = readSrc("src/app/(dashboard)/settings/dgii/certification/_components/CertificationBridge.tsx");
    expect(bridge).toMatch(/evidence\.length < 8/);
    expect(bridge).toMatch(/Evidencia: \$\{evidence\}/);
    expect(bridge).toMatch(/¿Este paso fue realmente completado en DGII\?/);
  });
});
