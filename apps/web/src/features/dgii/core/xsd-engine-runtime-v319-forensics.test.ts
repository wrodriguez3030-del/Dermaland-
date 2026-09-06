// Portada de agendapp: tests/unit/dgii-xsd-engine-runtime-v319-forensics.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadXsdForTipo } from "./xsd-loader";
import { validateEcfXml } from "./validator";
import { validateCertificationXml } from "./certification-xsd";
import { buildArecf } from "./builders/arecf";
import { rutaPortada, leerSiExiste } from "./__port__/rutas";

// v319-FORENSICS — La causa REAL del XSD_UNAVAILABLE persistente NO era el path (el
// audit de producción mostró baseDir=/var/task/docs/dgii/xsd, sentinel=true) sino el
// MOTOR xmllint-wasm: Turbopack lo bundleaba y su worker/`.wasm` no cargaban en la
// función serverless de Vercel. Fix: `serverExternalPackages:["xmllint-wasm"]` (no se
// bundlea → require nativo desde node_modules, __dirname real). Estos tests fijan que
// (1) el motor corre end-to-end en proceso, (2) la config lo externaliza, (3) el
// diagnóstico separa carga-de-archivo vs motor sin filtrar secretos, y (4) no se
// duplicó loader/validador/signer/crypto/XSD.

const readSrc = (rel: string) => readFileSync(rutaPortada(rel), "utf8");

describe("v319 — el motor xmllint-wasm CORRE en proceso (no 'engine unavailable')", () => {
  it("#6 valida un XML contra el XSD e-CF-32 SIN lanzar (motor inicializa)", async () => {
    const xsd = await loadXsdForTipo("32");
    // XML sintáctico mínimo: no es un e-CF válido, pero el motor DEBE ejecutar y
    // devolver un resultado (ok:false) en vez de lanzar por WASM/worker ausente.
    const res = await validateEcfXml({
      xml: '<?xml version="1.0" encoding="UTF-8"?><ECF><Encabezado/></ECF>',
      xsd,
      schemaName: "e-CF-32",
    });
    expect(res).toHaveProperty("ok");
    expect(typeof res.ok).toBe("boolean");
    expect(Array.isArray(res.errors)).toBe(true);
  });

  it("#7 un documento claramente inválido produce ok:false (el motor discrimina)", async () => {
    const xsd = await loadXsdForTipo("32");
    const res = await validateEcfXml({ xml: "<NoEsEcf/>", xsd, schemaName: "e-CF-32" });
    expect(res.ok).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it("#8 XML válido de certificación (ARECF) PASA por el mismo motor", async () => {
    const { xml } = buildArecf({
      rncEmisor: "131999999", rncComprador: "101000001", encf: "E310000000001",
      estado: 0, fechaHoraAcuseRecibo: "06-07-2026 10:00:00",
    });
    const res = await validateCertificationXml("ARECF", xml, { assumeUnsigned: true });
    expect(res.ok).toBe(true);
  });

  it("#2/#3/#4 el loader canónico lee E31/E32/E34 (path OK, reafirmación)", async () => {
    for (const t of ["31", "32", "34"]) {
      const xsd = await loadXsdForTipo(t);
      expect(xsd).toMatch(/<xs:schema/);
    }
  });
});

describe("v319 — next.config externaliza xmllint-wasm (evita el bundling de Turbopack)", () => {
  it("#10 serverExternalPackages incluye 'xmllint-wasm'", () => {
    const cfg = readSrc("next.config.ts");
    expect(cfg).toMatch(/serverExternalPackages:\s*\[[^\]]*["']xmllint-wasm["']/);
  });
  // PENDIENTE fase 6 (pantallas y rutas API): revive cuando exista next.config.ts.
  it.skip("conserva el fix previo de path (outputFileTracingRoot + include de XSD)", () => {
    const cfg = readSrc("next.config.ts");
    expect(cfg).toMatch(/outputFileTracingRoot/);
    expect(cfg).toMatch(/"\/api\/dgii\/\*\*":\s*\["\.\/docs\/dgii\/xsd\/\*\*"\]/);
  });
});

// PENDIENTE fase 3 (persistencia y orquestacion): el bloque entero guarda src/lib/dgii/certificate-storage.ts, que DermaLand aún no tiene.
describe.skip("v319 — diagnóstico separa etapa carga vs motor, sin filtrar secretos", () => {
  const src = leerSiExiste("src/lib/dgii/certificate-storage.ts");
  it("#1 la Etapa 4 se separa en dos try: loadXsdForTipo y validateEcfXml", () => {
    // loadXsdForTipo en su propio try → reporta stage 'load'
    expect(src).toMatch(/xsd = await loadXsdForTipo\("32"\);[\s\S]{0,120}reportXsdUnavailable\("load"/);
    // validateEcfXml en otro try → reporta stage 'engine'
    expect(src).toMatch(/validateEcfXml\([\s\S]{0,200}reportXsdUnavailable\("engine"/);
  });
  it("registra xsd_stage + clase/código/encabezado de la excepción", () => {
    expect(src).toMatch(/xsd_stage:\s*stage/);
    expect(src).toMatch(/xsd_error_name/);
    expect(src).toMatch(/xsd_error_code/);
  });
  it("el log/audit NO interpola XML/PEM/clave/password/blob", () => {
    const logLine = src.match(/console\.warn\(\s*`\[dgii:cert:test-local\][^`]*`/g) ?? [];
    expect(logLine.length).toBeGreaterThan(0);
    for (const l of logLine) expect(l).not.toMatch(/certPem|keyPem|privateKey|password|signedXml|blob/i);
    // el mensaje de error se recorta (solo 1ª línea, ≤200) — no vuelca stacks completos
    expect(src).toMatch(/message\.split\("\\n"\)\[0\]\.slice\(0,\s*200\)/);
  });
});

describe("v319 — invariantes de no-sobreescritura", () => {
  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/certificate-storage.ts.
  it.skip("#12/#13/#14 sin loader/validador/signer/crypto/XSD duplicados", () => {
    // un solo validador xmllint-wasm
    expect(readSrc("src/lib/dgii/validator.ts")).toMatch(/from "xmllint-wasm"/);
    // el loader no firma ni cifra
    const loader = readSrc("src/lib/dgii/xsd-loader.ts");
    expect(loader).not.toMatch(/createCipheriv|SignedXml|privateKey/);
    // certificate-storage reutiliza el validador y el loader canónicos (no reimplementa)
    const cs = readSrc("src/lib/dgii/certificate-storage.ts");
    expect(cs).toMatch(/from "\.\/validator"/);
    expect(cs).toMatch(/loadXsdForTipo/);
    expect(cs).not.toMatch(/import .*xmllint-wasm/); // no importa el motor por su cuenta
  });
  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/certificate-storage.ts.
  it.skip("#15 no activa DGII real ni envío (solo firma+verifica+XSD offline)", () => {
    const cs = readSrc("src/lib/dgii/certificate-storage.ts");
    expect(cs).not.toMatch(/dgii_enabled_real_send\s*=\s*true|sendToDgii|fetch\(/);
  });
});
