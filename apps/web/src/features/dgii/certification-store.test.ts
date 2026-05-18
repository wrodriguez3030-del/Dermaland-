// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  upsertEvidence,
  setEvidenceStatus,
  clearEvidence,
  listEvidences,
  getEvidenceFor,
  type CertificationEvidence,
} from "./certification-store";

function makeEvidence(
  tipo: "31" | "32" | "33" | "34",
  status: CertificationEvidence["status"] = "generado",
): CertificationEvidence {
  return {
    tipoEcf: tipo,
    eNcf: `E${tipo}0000099999`,
    securityCode: "AbCd1234",
    qrUrl: "https://ecf.dgii.gov.do/testecf/ConsultaTimbre/api/Consulta?x=1",
    runBy: "demo",
    runAt: new Date().toISOString(),
    status,
    isMock: true,
  };
}

beforeEach(() => {
  // Limpiar storage entre tests para aislamiento.
  if (typeof window !== "undefined") {
    window.localStorage.clear();
  }
});

describe("certification-store", () => {
  it("upsert agrega un registro nuevo", () => {
    upsertEvidence(makeEvidence("31"));
    const list = listEvidences();
    expect(list).toHaveLength(1);
    expect(list[0]?.tipoEcf).toBe("31");
  });

  it("upsert reemplaza (no duplica) un registro existente por tipo", () => {
    upsertEvidence(makeEvidence("31", "generado"));
    upsertEvidence(makeEvidence("31", "firmado"));
    const list = listEvidences();
    expect(list).toHaveLength(1);
    expect(list[0]?.status).toBe("firmado");
  });

  it("setEvidenceStatus actualiza el estado", () => {
    upsertEvidence(makeEvidence("32", "generado"));
    setEvidenceStatus("32", "evidencia_lista");
    expect(getEvidenceFor("32")?.status).toBe("evidencia_lista");
  });

  it("setEvidenceStatus es no-op si el tipo no tiene registro", () => {
    setEvidenceStatus("33", "firmado");
    expect(getEvidenceFor("33")).toBeUndefined();
  });

  it("clearEvidence elimina solo el tipo indicado", () => {
    upsertEvidence(makeEvidence("31"));
    upsertEvidence(makeEvidence("32"));
    upsertEvidence(makeEvidence("33"));
    clearEvidence("32");
    const tipos = listEvidences().map((e) => e.tipoEcf).sort();
    expect(tipos).toEqual(["31", "33"]);
  });

  it("getEvidenceFor retorna undefined si no existe", () => {
    expect(getEvidenceFor("34")).toBeUndefined();
  });

  it("todas las evidencias se marcan isMock = true", () => {
    upsertEvidence(makeEvidence("31"));
    expect(listEvidences()[0]?.isMock).toBe(true);
  });
});
