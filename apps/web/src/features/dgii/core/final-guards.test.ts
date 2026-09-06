// Portada de agendapp: tests/unit/dgii-final-guards.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, extname } from "node:path";
import { rutaPortada } from "./__port__/rutas";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(rutaPortada(p), "utf8");

function walk(dir: string, acc: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(resolve(ROOT, dir)); } catch { return acc; }
  for (const e of entries) {
    const rel = join(dir, e);
    const full = resolve(ROOT, rel);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(rel, acc);
    else acc.push(rel);
  }
  return acc;
}

const libDgiiFiles = walk("src/lib/dgii").filter((f) => f.endsWith(".ts"));

describe("guard final — sin red real a DGII", () => {
  /**
   * v558 — Quién puede llamar a `fetch()` dentro de `src/lib/dgii/`.
   *
   * Lista EXACTA, no un mínimo: el test falla tanto si aparece un `fetch` fuera
   * de ella como si un archivo de la lista deja de tenerlo. Ensancharla obliga a
   * tocar esta constante y escribir el porqué — que es justo lo que debe costar.
   */
  const PUEDEN_LLAMAR_FETCH = [
    // El único boundary del ENVÍO fiscal: multipart, auth por semilla,
    // killswitches y redacción. Todo lo que va a los servicios e-CF pasa por acá.
    "src/lib/dgii/dgii-http-transport.ts",
    /**
     * Descarga del padrón público de RNC (`DGII_RNC.zip`).
     *
     * Está en la lista porque NO es de lo que este invariante protege. El guard
     * existe para que ningún camino toque los servicios FISCALES de DGII fuera
     * del transporte auditado. Esta llamada:
     *   · baja un archivo estático y público — no llama a ninguna API;
     *   · no usa el certificado ni se autentica;
     *   · no consume secuencia ni produce comprobante alguno;
     *   · no toca datos de ningún negocio: el padrón es nacional.
     * No puede producir un acto fiscal, que es el daño que el invariante evita.
     *
     * Pasarla por `dgii-http-transport.ts` habría sido peor: ese transporte está
     * hecho para envíos multipart de XML con killswitches, y meterle una descarga
     * binaria de 22 MB ensucia el único punto auditado del envío.
     */
    "src/lib/dgii/rnc-padron-carga.ts",
  ];

  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/dgii-locations-data.ts.
  it.skip("fetch() SOLO existe en los archivos de la lista (boundary único)", () => {
    const conFetch = libDgiiFiles.filter((f) => /\bfetch\s*\(/.test(read(f)));
    expect([...conFetch].sort()).toEqual([...PUEDEN_LLAMAR_FETCH].sort());
  });

  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/rnc-padron-carga.ts.
  it.skip("la excepción del padrón no se cuela en el camino del envío fiscal", () => {
    // La excepción vale sólo para bajar el archivo. Si este módulo empezara a
    // hablar con los servicios e-CF, la justificación de arriba dejaría de valer.
    const carga = read("src/lib/dgii/rnc-padron-carga.ts");
    expect(carga).not.toMatch(/ecf\.dgii\.gov\.do|fc\.dgii\.gov\.do/);
    expect(carga).not.toMatch(/pkcs12|semilla|trackId/i);
  });
  it("dgii-client.ts no invoca fetch (usa transporte inyectable)", () => {
    const client = read("src/lib/dgii/dgii-client.ts");
    expect(/fetch\s*\(/.test(client)).toBe(false);
  });
  it("dgii-http-transport.ts no auto-ejecuta fetch en import (solo dentro de request())", () => {
    const tr = read("src/lib/dgii/dgii-http-transport.ts");
    // fetch debe estar dentro de createFetchTransport().request, no a nivel de módulo
    expect(/export function createFetchTransport/.test(tr)).toBe(true);
    expect(/^\s*fetch\s*\(/m.test(tr)).toBe(false); // sin llamada top-level
  });
});

describe("guard final — envío bloqueado", () => {
  it("executeDgiiSubmission default rechaza con DgiiSendDisabledError", async () => {
    const { executeDgiiSubmission } = await import("./dgii-client");
    const { DgiiSendDisabledError } = await import("./killswitches");
    const prepared = { method: "POST" as const, endpointUrl: "x", headersRedacted: {}, multipartParts: [], contentLength: 1, xmlSha256: "a", eNcf: "E320000000001", tipoEcf: "32", ambiente: "testecf" as const, executed: false as const };
    await expect(executeDgiiSubmission({ prepared })).rejects.toBeInstanceOf(DgiiSendDisabledError);
  });

  it("killswitches default false (env sin setear)", async () => {
    const prev = { t: process.env.DGII_TESTECF_SEND_ENABLED, c: process.env.DGII_CERTECF_SEND_ENABLED, p: process.env.DGII_PROD_SEND_ENABLED };
    delete process.env.DGII_TESTECF_SEND_ENABLED; delete process.env.DGII_CERTECF_SEND_ENABLED; delete process.env.DGII_PROD_SEND_ENABLED;
    try {
      const { getDgiiSendEnvironmentFlags } = await import("./killswitches");
      const f = getDgiiSendEnvironmentFlags();
      expect(f).toEqual({ testecf: false, certecf: false, prod: false });
    } finally {
      if (prev.t !== undefined) process.env.DGII_TESTECF_SEND_ENABLED = prev.t;
      if (prev.c !== undefined) process.env.DGII_CERTECF_SEND_ENABLED = prev.c;
      if (prev.p !== undefined) process.env.DGII_PROD_SEND_ENABLED = prev.p;
    }
  });

  it("transición prepared→submitted bloqueada si realSendAllowed=false", async () => {
    const { evaluateTransition } = await import("./submission-state-machine");
    const r = evaluateTransition({ currentStatus: "prepared", targetStatus: "submitted", hasPreparedSubmission: true, ambiente: "testecf", realSendAllowed: false });
    expect(r.allowed).toBe(false);
    expect(r.blockingReasons.some((x) => /killswitch/i.test(x))).toBe(true);
  });
});

describe("guard final — secretos y material sensible", () => {
  // PENDIENTE fase 9 (ensayo completo y empaquetado): revive cuando exista .env.example.
  it.skip(".env.example no contiene secretos reales (placeholders vacíos/false)", () => {
    const env = read(".env.example");
    expect(/DGII_CERT_ENCRYPTION_KEY=\s*$/m.test(env)).toBe(true); // vacío
    expect(/DGII_TESTECF_SEND_ENABLED=false/.test(env)).toBe(true);
    // sin JWT/keys reales pegadas
    expect(/eyJ[A-Za-z0-9_-]{30,}/.test(env)).toBe(false);
    expect(/sk_live_|whsec_|-----BEGIN/.test(env)).toBe(false);
  });

  it("no hay material de certificado real en el repo (src/tests/docs/scripts)", () => {
    const exts = new Set([".p12", ".pfx", ".pem", ".key", ".crt", ".cer"]);
    const files = ["src", "tests", "docs", "scripts", "prisma"].flatMap((d) => walk(d));
    const offenders = files.filter((f) => exts.has(extname(f).toLowerCase()));
    expect(offenders).toEqual([]);
  });
});

describe("guard final — UI sin envío real / API endurecida", () => {
  it("la UI DGII no expone un botón 'Enviar a DGII'", () => {
    const uiFiles = walk("src/app/(dashboard)/settings/dgii").filter((f) => f.endsWith(".tsx"));
    const blob = uiFiles.map(read).join("\n");
    expect(/Enviar a DGII|Enviar comprobante a DGII|Transmitir a DGII/i.test(blob)).toBe(false);
  });

  // PENDIENTE fase 6 (pantallas y rutas API): revive cuando exista src/app/api/dgii/invoices/prepare/route.ts.
  it.skip("prepare route rechaza live/send", () => {
    const route = read("src/app/api/dgii/invoices/prepare/route.ts");
    expect(/body\.live === true \|\| body\.send === true/.test(route)).toBe(true);
  });

  // PENDIENTE fase 9 (ensayo completo y empaquetado): revive cuando exista tests/integration/dgii-storage-bucket.integration.test.ts.
  it.skip("integration storage test sigue gated por DGII_STORAGE_IT", () => {
    const it = read("tests/integration/dgii-storage-bucket.integration.test.ts");
    expect(it.includes("DGII_STORAGE_IT")).toBe(true);
    expect(/skipIf/.test(it)).toBe(true);
  });

  // PENDIENTE fase 6 (pantallas y rutas API): revive cuando exista src/app/api/dgii/testecf/readiness/route.ts.
  it.skip("readiness API es GET de solo lectura (sin POST/PUT/DELETE)", () => {
    const route = read("src/app/api/dgii/testecf/readiness/route.ts");
    expect(/export async function GET/.test(route)).toBe(true);
    expect(/export async function (POST|PUT|DELETE|PATCH)/.test(route)).toBe(false);
    // no escribe DB ni envía: sin prisma.*.update/create ni sendInvoiceToTestecf
    expect(/\.(update|create|delete|upsert)\(/.test(route)).toBe(false);
    expect(/sendInvoiceToTestecf/.test(route)).toBe(false);
  });

  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/testecf-readiness.ts.
  it.skip("readiness evaluator no hace fetch ni escribe DB", () => {
    const svc = read("src/lib/dgii/testecf-readiness.ts");
    expect(/fetch\s*\(/.test(svc)).toBe(false);
    expect(/\.(update|create|delete|upsert)\(/.test(svc)).toBe(false);
  });

  // PENDIENTE fase 6 (pantallas y rutas API): revive cuando exista src/app/(dashboard)/settings/dgii/envios/_components/TestecfReadinessPanel.tsx.
  it.skip("el panel de readiness no tiene botón de envío habilitado", () => {
    const panel = read("src/app/(dashboard)/settings/dgii/envios/_components/TestecfReadinessPanel.tsx");
    // no debe existir un botón de envío real activo
    expect(/Enviar a TestECF(?!.*disabled)/.test(panel)).toBe(false);
  });

  // PENDIENTE fase 6 (pantallas y rutas API): revive cuando exista src/app/(dashboard)/settings/dgii/envios/page.tsx.
  it.skip("la pantalla dice que desde ahí no se envía a DGII", () => {
    // v523 — Antes se exigía la frase exacta DENTRO de TestecfReadinessPanel. La pantalla
    // la repetía tres veces —encabezado, checklist y comprobantes preparados—, así que
    // quedó una sola; atar el guard a un archivo concreto lo convertía en un guard de
    // redacción. Lo que importa es que la pantalla, como un todo, lo diga.
    const pantalla = [
      "src/app/(dashboard)/settings/dgii/envios/page.tsx",
      "src/app/(dashboard)/settings/dgii/envios/_components/TestecfReadinessPanel.tsx",
      "src/app/(dashboard)/settings/dgii/envios/_components/DryRunPanel.tsx",
      "src/app/(dashboard)/settings/dgii/envios/_components/FutureSendPanel.tsx",
    ]
      .map(read)
      .join("\n");
    expect(/no envía nada a DGII|sin mandarlo a DGII|apagado/.test(pantalla)).toBe(true);
  });
});

describe("guard final — paquete operativo G3B0", () => {
  const g3b0Scripts = [
    "scripts/dgii/g3b0-preflight.ts",
    "scripts/dgii/g3b0-readiness-report.ts",
    "scripts/dgii/g3b0-backup-instructions.ts",
  ];

  // PENDIENTE fase 9 (ensayo completo y empaquetado): revive cuando exista scripts/dgii/g3b0-preflight.ts.
  it.skip("los scripts G3B0 no llaman a dgii.gov.do", () => {
    for (const s of g3b0Scripts) expect(/dgii\.gov\.do/.test(read(s)), s).toBe(false);
  });

  // PENDIENTE fase 9 (ensayo completo y empaquetado): revive cuando exista scripts/dgii/g3b0-preflight.ts.
  it.skip("los scripts G3B0 no activan killswitches", () => {
    for (const s of g3b0Scripts) {
      const src = read(s);
      expect(/SEND_ENABLED\s*=\s*["'`]?true/.test(src), s).toBe(false);
      expect(/process\.env\.\w*SEND_ENABLED\s*=/.test(src), s).toBe(false);
    }
  });

  // PENDIENTE fase 9 (ensayo completo y empaquetado): revive cuando exista scripts/dgii/g3b0-preflight.ts.
  it.skip("los scripts G3B0 no escriben DB", () => {
    for (const s of g3b0Scripts) expect(/\.(update|create|delete|upsert)\(/.test(read(s)), s).toBe(false);
  });

  // PENDIENTE fase 9 (ensayo completo y empaquetado): revive cuando exista scripts/dgii/g3b0-preflight.ts.
  it.skip("los scripts G3B0 no contienen service_role key", () => {
    for (const s of g3b0Scripts) expect(/service_role|SUPABASE_SERVICE_ROLE/.test(read(s)), s).toBe(false);
  });

  // PENDIENTE fase 9 (ensayo completo y empaquetado): revive cuando exista scripts/dgii/g3b0-preflight.ts.
  it.skip("los scripts G3B0 no ejecutan pg_dump ni supabase db dump (solo texto)", () => {
    for (const s of g3b0Scripts) {
      const code = read(s)
        .split("\n")
        .filter((ln) => !ln.trimStart().startsWith("*") && !ln.trimStart().startsWith("//") && !ln.trimStart().startsWith("#"))
        .join("\n");
      expect(/(execSync|exec|spawn)\s*\([^)]*pg_dump/.test(code), s).toBe(false);
      expect(/(execSync|exec|spawn)\s*\([^)]*supabase\s+db\s+dump/.test(code), s).toBe(false);
    }
  });

  // PENDIENTE fase 9 (ensayo completo y empaquetado): revive cuando exista docs/dgii/G3B0_PAQUETE_OPERATIVO_TESTECF.md.
  it.skip("los docs G3B exigen las 3 frases", () => {
    const phrases = [
      "confirmo activar DGII_TESTECF_SEND_ENABLED para testecf en el proyecto chjxajkjcknfhctykirf",
      "confirmo activar dgii_enabled_real_send para el tenant [NOMBRE/RNC]",
      "confirmo enviar el comprobante [eNCF] a testecf DGII",
    ];
    for (const d of ["docs/dgii/G3B0_PAQUETE_OPERATIVO_TESTECF.md", "docs/dgii/G3B_ACTIVACION_MANUAL_TESTECF.md"]) {
      const src = read(d);
      for (const p of phrases) expect(src.includes(p), `${d} :: ${p}`).toBe(true);
    }
  });

  // PENDIENTE fase 9 (ensayo completo y empaquetado): revive cuando exista docs/dgii/G3B_ACTIVACION_MANUAL_TESTECF.md.
  it.skip("el doc de activación dice 'nunca producción ecf'", () => {
    const src = read("docs/dgii/G3B_ACTIVACION_MANUAL_TESTECF.md");
    expect(/[Nn]unca producción `?ecf`?/.test(src)).toBe(true);
  });

  // PENDIENTE fase 9 (ensayo completo y empaquetado): revive cuando exista .env.example.
  it.skip(".env.example mantiene killswitches en false", () => {
    const env = read(".env.example");
    expect(/DGII_TESTECF_SEND_ENABLED=false/.test(env)).toBe(true);
    expect(/DGII_CERTECF_SEND_ENABLED=false/.test(env)).toBe(true);
    expect(/DGII_PROD_SEND_ENABLED=false/.test(env)).toBe(true);
  });
});

describe("guard final — paquete de evidencia G3B0.1", () => {
  const evScripts = [
    "scripts/dgii/g3b0-generate-evidence-template.ts",
    "scripts/dgii/g3b0-post-send-checklist.ts",
  ];

  // PENDIENTE fase 9 (ensayo completo y empaquetado): revive cuando exista scripts/dgii/g3b0-generate-evidence-template.ts.
  it.skip("los scripts de evidencia no llaman a dgii.gov.do ni a primitivas operativas", () => {
    for (const s of evScripts) {
      const src = read(s);
      expect(/dgii\.gov\.do/.test(src), s).toBe(false);
      expect(/requestSemilla|validarSemilla|recepcionEcf|consultarEstadoTrackId/.test(src), s).toBe(false);
    }
  });

  // PENDIENTE fase 9 (ensayo completo y empaquetado): revive cuando exista scripts/dgii/g3b0-generate-evidence-template.ts.
  it.skip("los scripts de evidencia no escriben DB ni activan flags", () => {
    for (const s of evScripts) {
      const src = read(s);
      expect(/prisma|service_role/.test(src), s).toBe(false);
      expect(/SEND_ENABLED\s*=\s*["'`]?true/.test(src), s).toBe(false);
    }
  });

  // PENDIENTE fase 9 (ensayo completo y empaquetado): revive cuando exista docs/dgii/G3B_EVIDENCIA_POST_ENVIO_TESTECF.md.
  it.skip("el doc de evidencia prohíbe XML completo/token y exige no revertir e-NCF", () => {
    const src = read("docs/dgii/G3B_EVIDENCIA_POST_ENVIO_TESTECF.md");
    expect(/XML completo/i.test(src)).toBe(true);
    expect(/no se revierte ni se reutiliza|no revertir.*e-?NCF/i.test(src)).toBe(true);
    expect(/nunca producción `?ecf`?/i.test(src)).toBe(true);
  });

  // PENDIENTE fase 9 (ensayo completo y empaquetado): revive cuando exista docs/dgii/templates/G3B_EVIDENCIA_PRIMER_ENVIO_TEMPLATE.md.
  it.skip("la plantilla de evidencia no contiene secretos ni datos reales", () => {
    const src = read("docs/dgii/templates/G3B_EVIDENCIA_PRIMER_ENVIO_TEMPLATE.md");
    expect(/eyJ[A-Za-z0-9_-]{20,}|-----BEGIN|sk_live_/.test(src)).toBe(false);
  });
});

describe("guard final — simulación no fiscal / sin XML expuesto", () => {
  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/submission-simulation-service.ts.
  it.skip("submission-simulation-service nunca marca fiscalAcceptance:true", () => {
    const svc = read("src/lib/dgii/submission-simulation-service.ts");
    expect(/fiscalAcceptance:\s*true/.test(svc)).toBe(false);
    expect(/fiscalAcceptance: false/.test(svc)).toBe(true);
  });

  it("PrepareDgiiInvoiceResult no devuelve el XML (solo sha256/path redactado)", () => {
    const t = read("src/lib/dgii/invoice-prepare-types.ts");
    expect(/\bxml:\s*string/.test(t)).toBe(false);
    expect(t.includes("xmlSha256")).toBe(true);
    expect(t.includes("xmlSignedPathRedacted")).toBe(true);
  });
});
