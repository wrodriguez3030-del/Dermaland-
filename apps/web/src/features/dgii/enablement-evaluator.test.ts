import { describe, it, expect } from "vitest";
import { evaluateEnablement } from "./enablement-evaluator";
import type { EnablementProgress, EnablementStepId } from "./enablement-store";
import type {
  CertificateMockState,
  CertificateStatus,
} from "./certificate-status-store";
import { dgiiEnablementSteps } from "@/lib/mock-data/dgii-enablement";

function cert(status: CertificateStatus): CertificateMockState {
  return {
    status,
    updatedAt: "2026-05-20T00:00:00.000Z",
  };
}

function step(
  stepId: EnablementStepId,
  status: EnablementProgress["status"],
  done = 0,
  total = 0,
): EnablementProgress {
  const checklist = Array.from({ length: total }, (_, i) => ({
    id: `it-${i}`,
    label: `item ${i}`,
    done: i < done,
  }));
  return {
    stepId,
    status,
    updatedAt: "2026-05-20T00:00:00.000Z",
    checklist,
  };
}

/**
 * Helper para construir el paso `autorizacion_representante` con
 * evidencia completa (todos los items confirmed) Y declaración
 * aceptada. Sin esto el evaluador degrada el status a in_progress.
 */
function fullyConfirmedRepresentante(): EnablementProgress {
  const def = dgiiEnablementSteps.find(
    (s) => s.id === "autorizacion_representante",
  )!;
  return {
    stepId: "autorizacion_representante",
    status: "completed",
    updatedAt: "2026-05-20T00:00:00.000Z",
    declarationAccepted: true,
    declarationAcceptedAt: "2026-05-20T00:00:00.000Z",
    checklist: def.checklist.map((it) => ({
      id: it.id,
      label: it.label,
      done: true,
      evidence: {
        status: "confirmed",
        responsible: "test contador",
        confirmedAt: "2026-05-20T00:00:00.000Z",
      },
    })),
  };
}

describe("evaluateEnablement", () => {
  it("estado not_started cuando no hay progreso ni certificado", () => {
    const ev = evaluateEnablement([], cert("not_uploaded"));
    expect(ev.globalStatus).toBe("not_started");
    expect(ev.totals.completed).toBe(0);
    expect(ev.totals.blocked).toBe(0);
    expect(ev.nextStep?.id).toBe("certificado_digital");
  });

  it("blocked_by_certificate si el cert está vencido", () => {
    const ev = evaluateEnablement([], cert("expired"));
    expect(ev.globalStatus).toBe("blocked_by_certificate");
  });

  it("blocked_by_certificate si el cert está inválido", () => {
    const ev = evaluateEnablement([], cert("invalid"));
    expect(ev.globalStatus).toBe("blocked_by_certificate");
  });

  it("blocked_by_fiscal_config si el cert es válido pero config fiscal no avanzó", () => {
    const progress = [step("certificado_digital", "completed")];
    const ev = evaluateEnablement(progress, cert("valid"));
    expect(ev.globalStatus).toBe("blocked_by_fiscal_config");
  });

  it("ready_for_testecf con cert válido + config fiscal + autorización representante (evidencia + declaración)", () => {
    const progress = [
      step("certificado_digital", "completed"),
      step("configuracion_fiscal", "completed"),
      fullyConfirmedRepresentante(),
    ];
    const ev = evaluateEnablement(progress, cert("valid"));
    expect(ev.globalStatus).toBe("ready_for_testecf");
  });

  it("NO es ready_for_testecf si falta la autorización del representante (gate pre-Fase G)", () => {
    const progress = [
      step("certificado_digital", "completed"),
      step("configuracion_fiscal", "completed"),
      // autorizacion_representante intencionalmente OMITIDO.
    ];
    const ev = evaluateEnablement(progress, cert("valid"));
    expect(ev.globalStatus).not.toBe("ready_for_testecf");
    expect(ev.globalStatus).toBe("in_preparation");
  });

  it("NO es ready_for_testecf si el representante tiene status=completed pero falta evidencia", () => {
    // El usuario forzó completed via Select pero NO completó evidencia.
    const progress = [
      step("certificado_digital", "completed"),
      step("configuracion_fiscal", "completed"),
      step("autorizacion_representante", "completed"), // sin evidencia + sin declaración
    ];
    const ev = evaluateEnablement(progress, cert("valid"));
    expect(ev.globalStatus).not.toBe("ready_for_testecf");
    // Diagnóstico degrada el step a in_progress.
    const rep = ev.diagnostics.find(
      (d) => d.stepId === "autorizacion_representante",
    );
    expect(rep?.status).toBe("in_progress");
  });

  it("NO es ready_for_testecf si la declaración NO está aceptada aunque los 9 items estén confirmed", () => {
    const rep = fullyConfirmedRepresentante();
    rep.declarationAccepted = false;
    delete rep.declarationAcceptedAt;
    const progress = [
      step("certificado_digital", "completed"),
      step("configuracion_fiscal", "completed"),
      rep,
    ];
    const ev = evaluateEnablement(progress, cert("valid"));
    expect(ev.globalStatus).not.toBe("ready_for_testecf");
  });

  it("in_certification cuando pruebas + reps están listas y postulacion in_progress", () => {
    const progress = [
      step("certificado_digital", "completed"),
      step("configuracion_fiscal", "completed"),
      step("pruebas_ecf", "completed"),
      step("representaciones", "completed"),
      step("postulacion", "in_progress"),
    ];
    const ev = evaluateEnablement(progress, cert("valid"));
    expect(ev.globalStatus).toBe("in_certification");
  });

  it("certified_by_dgii cuando postulación + declaración + autorización representante están completed", () => {
    const progress = [
      step("certificado_digital", "completed"),
      step("configuracion_fiscal", "completed"),
      step("pruebas_ecf", "completed"),
      step("representaciones", "completed"),
      step("postulacion", "completed"),
      step("declaracion_jurada", "completed"),
      fullyConfirmedRepresentante(),
    ];
    const ev = evaluateEnablement(progress, cert("valid"));
    expect(ev.globalStatus).toBe("certified_by_dgii");
  });

  it("ready_for_fiscal_production cuando todos los 8 pasos clave están completed", () => {
    const progress = [
      step("certificado_digital", "completed"),
      step("configuracion_fiscal", "completed"),
      step("postulacion", "completed"),
      step("pruebas_ecf", "completed"),
      step("representaciones", "completed"),
      step("url_produccion", "completed"),
      step("declaracion_jurada", "completed"),
      fullyConfirmedRepresentante(),
      step("roles_ncf", "completed"),
    ];
    const ev = evaluateEnablement(progress, cert("valid"));
    expect(ev.globalStatus).toBe("ready_for_fiscal_production");
    expect(ev.nextStep).toBeNull();
  });

  it("incluye 9 diagnósticos (excluye estado_final)", () => {
    const ev = evaluateEnablement([], cert("not_uploaded"));
    expect(ev.diagnostics).toHaveLength(9);
    expect(ev.diagnostics.find((d) => d.stepId === "estado_final")).toBeUndefined();
    expect(
      ev.diagnostics.find((d) => d.stepId === "autorizacion_representante"),
    ).toBeDefined();
  });

  it("cada diagnóstico trae summary y recommendation no vacíos", () => {
    const ev = evaluateEnablement([], cert("not_uploaded"));
    for (const d of ev.diagnostics) {
      expect(d.summary.length).toBeGreaterThan(0);
      expect(d.recommendation.length).toBeGreaterThan(0);
    }
  });

  it("mockNotice presente para recordar MOCK/DEMO/NO FISCAL", () => {
    const ev = evaluateEnablement([], cert("not_uploaded"));
    expect(ev.mockNotice).toMatch(/MOCK/);
    expect(ev.mockNotice).toMatch(/NO FISCAL/);
  });

  it("nextStep prioriza el primer paso no completado en orden", () => {
    const progress = [
      step("certificado_digital", "completed"),
      step("configuracion_fiscal", "completed"),
    ];
    const ev = evaluateEnablement(progress, cert("valid"));
    expect(ev.nextStep?.id).toBe("postulacion");
  });
});
