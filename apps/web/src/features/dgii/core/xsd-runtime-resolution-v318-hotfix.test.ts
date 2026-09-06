// Portada de agendapp: tests/unit/dgii-xsd-runtime-resolution-v318-hotfix.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  pickXsdDir,
  XSD_DIR,
  xsdDirDiagnostics,
  loadXsdForTipo,
  resolveXsdPath,
} from "./xsd-loader";
import { validateCertificationXml } from "./certification-xsd";
import { buildArecf } from "./builders/arecf";
import { rutaPortada } from "./__port__/rutas";

// v318-HOTFIX — resolución robusta del dir de XSD (bug real: process.cwd() en Vercel
// no apunta a los XSD trazados → XSD_UNAVAILABLE). Reutiliza el loader canónico.

const readSrc = (rel: string) => readFileSync(rutaPortada(rel), "utf8");

describe("v318-HOTFIX — pickXsdDir elige el primer candidato con XSD reales", () => {
  it("elige el candidato cuyo sentinel existe (no el primero a ciegas)", () => {
    const good = "/real/docs/dgii/xsd";
    const exists = (p: string) => p === path.join(good, "e-CF-32-v1.0.xsd");
    expect(pickXsdDir(["/nope/a", "/nope/b", good, "/nope/c"], exists)).toBe(good);
  });
  it("si ningún candidato tiene XSD → cae al primero (comportamiento previo, no rompe)", () => {
    expect(pickXsdDir(["/x/a", "/x/b"], () => false)).toBe("/x/a");
  });
  it("no revienta si un candidato es inaccesible (try/catch por candidato)", () => {
    const throwOn = (p: string) => {
      if (p.includes("boom")) throw new Error("EACCES");
      return p.includes("ok");
    };
    expect(pickXsdDir(["/boom/x", "/ok/y"], throwOn)).toBe("/ok/y");
  });
});

describe("v318-HOTFIX — el dir resuelto realmente contiene los XSD (build-agnóstico)", () => {
  it("XSD_DIR resuelto tiene el sentinel e-CF-32 y los 4 e-CF + 4 de certificación", () => {
    const diag = xsdDirDiagnostics();
    expect(diag.sentinelExists).toBe(true);
    expect(diag.baseDir).toBe(XSD_DIR);
    for (const f of [
      "e-CF-31-v1.0.xsd", "e-CF-32-v1.0.xsd", "e-CF-33-v1.0.xsd", "e-CF-34-v1.0.xsd",
      "ARECF-v1.0.xsd", "ACECF-v1.0.xsd", "ANECF-v1.0.xsd", "RFCE-32-v1.0.xsd",
    ]) {
      expect(existsSync(path.join(XSD_DIR, f))).toBe(true);
    }
  });
});

describe("v318-HOTFIX — lectura REAL vía el mecanismo del runtime (no solo nft.json)", () => {
  it("#1/#2/#3 loadXsdForTipo lee E31/E32/E34 desde el path resuelto", async () => {
    for (const t of ["31", "32", "34"]) {
      const xsd = await loadXsdForTipo(t);
      expect(xsd).toMatch(/<xs:schema/);
    }
  });
  it("#4 el loader de certificación lee y valida contra ARECF (mismo dir)", async () => {
    const { xml } = buildArecf({
      rncEmisor: "131999999", rncComprador: "101000001", encf: "E310000000001",
      estado: 0, fechaHoraAcuseRecibo: "06-07-2026 10:00:00",
    });
    const res = await validateCertificationXml("ARECF", xml, { assumeUnsigned: true });
    expect(res.ok).toBe(true);
  });
  it("#5 path traversal sigue bloqueado (anti-traversal intacto)", () => {
    expect(() => resolveXsdPath("../../../etc/passwd")).toThrow();
    expect(() => resolveXsdPath("99")).toThrow();
  });
  it("#6 tipo inválido → error controlado (no lee fs arbitrario)", () => {
    expect(() => resolveXsdPath("31x")).toThrow();
  });
});

describe("v318-HOTFIX — invariantes de no-sobreescritura", () => {
  it("no se tocó el signer ni el cifrado (fuera del diff de este hotfix)", () => {
    // el loader importa fs para existsSync pero NO cifra ni firma
    const src = readSrc("src/lib/dgii/xsd-loader.ts");
    expect(src).not.toMatch(/createCipheriv|SignedXml|privateKey/);
    expect(src).toMatch(/pickXsdDir/); // resolución robusta añadida al loader canónico
  });
  // PENDIENTE fase 9 (ensayo completo y empaquetado): revive cuando exista next.config.ts.
  it.skip("next.config fija tracing root + include de docs/dgii/xsd", () => {
    const cfg = readSrc("next.config.ts");
    expect(cfg).toMatch(/outputFileTracingRoot/);
    expect(cfg).toMatch(/"\/api\/dgii\/\*\*":\s*\["\.\/docs\/dgii\/xsd\/\*\*"\]/);
  });
  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/certificate-storage.ts.
  it.skip("diagnóstico seguro en el log de XSD_UNAVAILABLE (path + existencia, sin secretos)", () => {
    const src = readSrc("src/lib/dgii/certificate-storage.ts");
    expect(src).toMatch(/xsdDirDiagnostics\(\)/);
    expect(src).toMatch(/baseDir=\$\{diag\.baseDir\}/);
    // el log solo interpola baseDir + sentinel (path + bool), nunca PEM/clave/password
    const logLine = src.match(/console\.warn\(`\[dgii:cert:test-local\][^`]*`\)/g) ?? [];
    for (const l of logLine) expect(l).not.toMatch(/certPem|keyPem|privateKey|password|blob/i);
  });
});
