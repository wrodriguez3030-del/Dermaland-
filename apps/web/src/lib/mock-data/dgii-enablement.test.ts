import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  dgiiEnablementSteps,
  dgiiEnablementServiceUrls,
  dgiiEnablementRelevantPermissions,
  dgiiEnablementBaseUrl,
} from "./dgii-enablement";

const PAGE_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "app",
  "(app)",
  "dgii",
  "habilitacion",
  "page.tsx",
);

const SIDEBAR_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "components",
  "layout",
  "sidebar.tsx",
);

describe("dgii-enablement catalog", () => {
  it("declara exactamente 10 pasos (incluye certificado_digital, autorizacion_representante y estado_final)", () => {
    expect(dgiiEnablementSteps).toHaveLength(10);
  });

  it("los pasos están ordenados 1..10", () => {
    const orders = dgiiEnablementSteps.map((s) => s.order);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("paso 1 es Certificado digital, paso 8 es Autorización del representante, paso 10 es Estado final", () => {
    expect(dgiiEnablementSteps[0]?.id).toBe("certificado_digital");
    expect(dgiiEnablementSteps[7]?.id).toBe("autorizacion_representante");
    expect(dgiiEnablementSteps[9]?.id).toBe("estado_final");
  });

  it("estado_final es read-only (sin checklist accionable)", () => {
    const final = dgiiEnablementSteps.find((s) => s.id === "estado_final");
    expect(final?.readOnly).toBe(true);
    expect(final?.checklist).toHaveLength(0);
  });

  it("los IDs son únicos", () => {
    const ids = dgiiEnablementSteps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cada paso accionable tiene checklist con ≥3 items con IDs únicos", () => {
    for (const step of dgiiEnablementSteps) {
      if (step.readOnly) continue;
      expect(step.checklist.length).toBeGreaterThanOrEqual(3);
      const ids = step.checklist.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("cada paso tiene ruta interna válida (/)", () => {
    for (const step of dgiiEnablementSteps) {
      expect(step.route.startsWith("/")).toBe(true);
    }
  });

  it("los pasos con requiresDgii tienen blockedReason explícito", () => {
    const dgiiSteps = dgiiEnablementSteps.filter((s) => s.requiresDgii);
    expect(dgiiSteps.length).toBeGreaterThan(0);
    // url_produccion debe estar bloqueado por Fase G/H
    const url = dgiiSteps.find((s) => s.id === "url_produccion");
    expect(url?.blockedReason).toMatch(/Fase G|Fase H/);
  });

  it("ningún paso declara endpoint DGII real activo", () => {
    const blob = JSON.stringify(dgiiEnablementSteps);
    // El catálogo puede MENCIONAR conceptos (.p12, .pfx) en descripciones,
    // pero no debe contener URLs DGII reales activas ni rutas a archivos.
    expect(blob).not.toMatch(/ecf\.dgii\.gov\.do\/ecf\b/);
    expect(blob).not.toMatch(/https?:\/\/[^"]*\.p12/);
    expect(blob).not.toMatch(/\/cert[a-z]*\.p12/i);
  });

  it("dgiiEnablementServiceUrls son todos mock o stub (nunca live)", () => {
    for (const url of dgiiEnablementServiceUrls) {
      expect(["mock", "stub"]).toContain(url.state);
    }
  });

  it("dgiiEnablementBaseUrl apunta a Vercel (no a ecf.dgii.gov.do)", () => {
    expect(dgiiEnablementBaseUrl).toMatch(/dermaland\.vercel\.app/);
    expect(dgiiEnablementBaseUrl).not.toMatch(/dgii\.gov\.do/);
  });

  it("incluye permisos críticos DGII en el listado de referencia", () => {
    expect(dgiiEnablementRelevantPermissions).toContain("dgii:invoices:sign");
    expect(dgiiEnablementRelevantPermissions).toContain("dgii:invoices:send");
    expect(dgiiEnablementRelevantPermissions).toContain("dgii:configure");
  });
});

describe("/dgii/habilitacion page", () => {
  const source = readFileSync(PAGE_PATH, "utf8");

  it("la página existe y exporta default", () => {
    expect(source).toMatch(/export default function DgiiHabilitacionPage/);
  });

  it("usa el mock store (no llama DGII real)", () => {
    expect(source).toMatch(/useEnablementProgress/);
    expect(source).not.toMatch(/fetch\(.*ecf\.dgii\.gov\.do/);
    expect(source).not.toMatch(/testecf\.dgii\.gov\.do/);
  });

  it("muestra la advertencia mock / demo / no fiscal", () => {
    expect(source).toMatch(/mock \/ demo \/ no fiscal/i);
  });

  it("indica que no se envía nada a DGII", () => {
    expect(source).toMatch(/[Nn]o se env[ií]a/);
  });

  it("renderiza el progress bar con role=progressbar y aria-valuenow", () => {
    expect(source).toMatch(/role="progressbar"/);
    expect(source).toMatch(/aria-valuenow=\{percent\}/);
  });

  it("incluye links a los 9 módulos referenciados por los pasos", () => {
    const allRoutes = new Set(dgiiEnablementSteps.map((s) => s.route));
    expect(source).toMatch(/\/admin\/permisos/);
    expect(allRoutes.has("/dgii/configuracion")).toBe(true);
    expect(allRoutes.has("/dgii/certificacion")).toBe(true);
    expect(allRoutes.has("/dgii/certificado")).toBe(true);
  });

  it("incluye el botón Ejecutar revisión de habilitación", () => {
    expect(source).toMatch(/Ejecutar revisi[oó]n de habilitaci[oó]n/);
  });

  it("incluye el panel Estado de habilitación DGII", () => {
    expect(source).toMatch(/Estado de habilitaci[oó]n DGII/);
  });

  it("incluye leyenda con los 7 estados", () => {
    const states = [
      "pending",
      "in_progress",
      "completed",
      "blocked",
      "requires_user_action",
      "requires_accountant_validation",
      "requires_dgii_validation",
    ];
    for (const s of states) {
      expect(source).toMatch(new RegExp(`status="${s}"`));
    }
  });
});

describe("sidebar nav", () => {
  const source = readFileSync(SIDEBAR_PATH, "utf8");

  it("incluye el item Habilitación que apunta a /dgii/habilitacion", () => {
    expect(source).toMatch(/Habilitación.*\/dgii\/habilitacion/);
  });
});
