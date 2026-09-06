// Portada de agendapp: tests/unit/dgii-postulacion-url-ux-v346.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parsePostulacion,
  validatePostulacionContent,
  type PostulacionExpectations,
} from "./postulacion-content";
import { rutaPortada, leerSiExiste } from "./__port__/rutas";

/**
 * v346 — Incidente UX real (2026-07-10): la pantalla /dgii/certification
 * mostraba las rutas técnicas completas (…/fe/recepcion/api/ecf) CON botón
 * Copiar en la vieja "Sección A", y el dueño las pegó en los campos de URL del
 * Portal DGII (que concatena los sufijos /fe/… automáticamente sobre la BASE).
 * El validador canónico bloqueó la firma (correcto), pero la UI indujo el error.
 * Estos tests fijan: la separación copiable(base)/informativo(técnico), los
 * mensajes accionables del validador (SIN debilitarlo) y las equivalencias
 * seguras de URL (solo protocolo/mayúsculas/trailing slash).
 */

const readSrc = (rel: string) => readFileSync(rutaPortada(rel), "utf8");

const BASE = "agendapps.com/t/cibao-spa-laser";
const EXP: PostulacionExpectations = {
  tenantRnc: "131793916",
  certHolderId: "00114491111",
  appVersion: "1.0",
  expectedUrlBase: BASE,
    expectedNombre: "agendapps",
    authEnabled: false,
};

function xml(over: { tipos?: string; rec?: string; apr?: string; auth?: string } = {}) {
  return `<Postulacion>
    <PostulacionID>99999</PostulacionID>
    <GrupoComprobante>${over.tipos ?? "31,32,33,34,41,43,44,45,46,47"}</GrupoComprobante>
    <RNCContribuyente>131793916</RNCContribuyente>
    <RNCRepresentante>001-1449111-1</RNCRepresentante>
    <NombreSoftware>agendapps</NombreSoftware>
    <VersionSoftware>1.0</VersionSoftware>
    <UrlRecepcion>${over.rec ?? `https://${BASE}`}</UrlRecepcion>
    <UrlAprobacionComercial>${over.apr ?? `https://${BASE}`}</UrlAprobacionComercial>
    <UrlAutenticacion>${over.auth ?? ""}</UrlAutenticacion>
  </Postulacion>`;
}

const validate = (over?: Parameters<typeof xml>[0]) =>
  validatePostulacionContent(parsePostulacion(xml(over))!, EXP);

describe("v346 — validador canónico: URL base vs ruta técnica", () => {
  it("acepta la URL base correcta (con https://, sin https://, y con trailing slash)", () => {
    for (const rec of [`https://${BASE}`, BASE, `https://${BASE}/`, `HTTPS://${BASE.toUpperCase()}`]) {
      const v = validate({ rec, apr: rec });
      expect(v.ok, `debía aceptar ${rec}: ${v.blockers.join(" | ")}`).toBe(true);
      expect(v.blockers).toEqual([]);
    }
  });

  it("rechaza la ruta técnica de RECEPCIÓN pegada en el portal, con mensaje accionable", () => {
    const v = validate({ rec: `https://${BASE}/fe/recepcion/api/ecf` });
    expect(v.ok).toBe(false);
    const msg = v.blockers.join(" ");
    expect(msg).toMatch(/UrlRecepcion.*ruta técnica completa/);
    expect(msg).toMatch(/SOLO la URL base/);
    expect(msg).toContain(BASE);
    expect(msg).toMatch(/NO incluyas \/fe\/recepcion\/api\/ecf ni \/fe\/aprobacioncomercial\/api\/ecf/);
  });

  it("rechaza la ruta técnica de APROBACIÓN COMERCIAL pegada en el portal", () => {
    const v = validate({ apr: `https://${BASE}/fe/aprobacioncomercial/api/ecf` });
    expect(v.ok).toBe(false);
    expect(v.blockers.join(" ")).toMatch(/UrlAprobacionComercial.*ruta técnica completa/);
  });

  it("v368: los 10 tipos exactos aceptados; 42/extra rechazado; 31-34 solo = INCOMPLETO", () => {
    expect(validate({ tipos: "31,32,33,34,41,43,44,45,46,47" }).ok).toBe(true);
    const inc = validate({ tipos: "31,32,33,34" });
    expect(inc.ok).toBe(false);
    expect(inc.blockers.join(" ")).toMatch(/Faltan tipos/);
    const v = validate({ tipos: "31,32,33,34,41,43,44,45,46,47,42" });
    expect(v.ok).toBe(false);
    const msg = v.blockers.join(" ");
    for (const t of ["41", "43", "44", "45", "46", "47"]) expect(msg).toContain(t);
    expect(msg).toMatch(/42/); // el 42 jamás
  });

  it("v368: autenticación vacía aceptada; declarada con gate OFF → BLOCKER", () => {
    expect(validate({ auth: "" }).warnings).toEqual([]);
    const v = validate({ auth: `https://${BASE}` });
    expect(v.ok).toBe(false); // v368: gate OFF → declararla bloquea
    expect(v.blockers.join(" ")).toMatch(/UrlAutenticacion.*APAGADO/);
  });

  it("host incorrecto, slug de otro tenant, path extra y query/fragment → rechazados fail-closed", () => {
    const bad = [
      "https://otrohost.com/t/cibao-spa-laser", // host incorrecto
      "https://agendapps.com/t/otro-negocio", // slug de otro tenant
      `https://${BASE}/extra`, // path adicional
      `https://${BASE}?x=1`, // query
      `https://${BASE}#frag`, // fragment
      `https://user@${BASE}`, // userinfo
    ];
    for (const rec of bad) {
      const v = validate({ rec });
      expect(v.ok, `debía rechazar ${rec}`).toBe(false);
      expect(v.blockers.join(" ")).toMatch(/UrlRecepcion/);
    }
  });

  // PENDIENTE fase 6 (pantallas y rutas API): revive cuando exista src/app/api/dgii/certification/sign/route.ts.
  it.skip("la firma sigue bloqueada en SERVIDOR cuando el análisis falla (422 canónico)", () => {
    const sign = readSrc("src/app/api/dgii/certification/sign/route.ts");
    expect(sign).toMatch(/postulacion_invalida/);
    expect(sign).toMatch(/422/);
    expect(sign).toMatch(/reviewPostulacionXml|validation/);
  });
});

// PENDIENTE fase 6 (pantallas y rutas API): el bloque entero guarda src/app/(dashboard)/settings/dgii/certification/_components/CertificationBridge.tsx, que DermaLand aún no tiene.
// PENDIENTE fase 3 (persistencia y orquestacion): el bloque entero guarda src/lib/dgii/certification-portal.ts, que DermaLand aún no tiene.
describe.skip("v346 — contrato de la UI (base copiable, técnica informativa)", () => {
  const bridge = leerSiExiste("src/app/(dashboard)/settings/dgii/certification/_components/CertificationBridge.tsx");
  const portal = leerSiExiste("src/lib/dgii/certification-portal.ts");

  it("los botones Copiar de Recepción/Aprobación copian la URL BASE (composeFeDeclarableBase), nunca la ruta /fe/", () => {
    // La fuente de los valores copiables es getPortalRecommendedValues → urlBase.
    expect(portal).toMatch(/composeFeDeclarableBase\(baseUrl, opts\.feSlug\)/);
    expect(portal).toMatch(/NO agregues \/fe\/recepcion\/api\/ecf/);
    // Y composeFeDeclarableBase jamás incluye sufijos /fe/:
    expect(portal).toMatch(/return `\$\{host\}\/t\/\$\{slug\}`/);
  });

  it("la sección técnica es informativa: sin botón Copiar y con advertencia explícita", () => {
    expect(bridge).toMatch(/copiable=\{false\}/);
    expect(bridge).toMatch(/Ruta técnica — NO copiarla en los campos de URL del Portal DGII/);
    expect(bridge).toMatch(/Estado de los servicios técnicos/);
    // El botón Copiar de CopyRow exige copiable (default true, false en técnicas):
    expect(bridge).toMatch(/\{value && copiable \? \(/);
  });

  it("el label de estado es contextual sin cambiar readiness real (gate OFF ≠ 'no puedes postular')", () => {
    expect(bridge).toMatch(/Implementado · pendiente de activación/);
    expect(bridge).toMatch(/Puedes preparar y\s+regenerar la postulación AHORA/);
    // ready sigue derivado del gate real en certification-portal (sin tocar semántica):
    expect(portal).toMatch(/ready: feEnabled && !!baseUrl/);
    expect(portal).toMatch(/ready: acecfEnabled && !!baseUrl/);
  });

  it("el paso 4 instruye el orden correcto y ninguna UI nueva escribe fe_endpoint_slug fuera del writer canónico", () => {
    expect(bridge).toMatch(/exactamente \{SUPPORTED_ECF_TIPOS/); // v368: lista dinámica de los 10
    // v523 — «dejala» → «déjala» (tuteo). Lo que importa es la instrucción, no la
    // conjugación: se afirma el campo + VACÍA, que es el dato que no puede perderse.
    expect(bridge).toMatch(/URL Autenticación:[^<]*VACÍA/);
    expect(bridge).toMatch(/XML SIN firma/);
    // Única vía de escritura de la identidad fiscal: el endpoint canónico v340.
    expect(bridge).toMatch(/api\/dgii\/settings\/fiscal-slug/);
    expect(bridge).not.toMatch(/\$queryRaw|\$executeRaw|UPDATE dgii_settings/);
  });
});
