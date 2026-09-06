// Portada de agendapp: tests/unit/dgii-mock-server.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createDgiiMockServer, scenarioToLocalStatus } from "./dgii-mock-server";
import type { DgiiMockScenario } from "./dgii-mock-types";

describe("createDgiiMockServer — flujo feliz", () => {
  it("semilla devuelve XML controlado", () => {
    const r = createDgiiMockServer("accepted").semilla();
    expect(r.status).toBe(200);
    expect(r.seedXml).toContain("SemillaModel");
  });
  it("validarSemilla devuelve token fake", () => {
    const r = createDgiiMockServer("accepted").validarSemilla("<SignedSeed/>");
    expect(r.status).toBe(200);
    if (r.status === 200) expect(r.token).toMatch(/^MOCK-TOKEN/);
  });
  it("recepción devuelve trackId fake determinístico", () => {
    const a = createDgiiMockServer("accepted").recepcion({ eNcf: "E320000000001" });
    const b = createDgiiMockServer("accepted").recepcion({ eNcf: "E320000000001" });
    expect(a.status).toBe(200);
    if (a.status === 200 && b.status === 200) expect(a.trackId).toBe(b.trackId);
  });
  it("estado accepted / rejected / in_process", () => {
    expect(createDgiiMockServer("accepted").consultarEstado("T").estado).toBe("accepted");
    expect(createDgiiMockServer("accepted_conditional").consultarEstado("T").estado).toBe("accepted_conditional");
    expect(createDgiiMockServer("rejected").consultarEstado("T").estado).toBe("rejected");
    // default scenario que no resuelve a terminal:
    const srv = createDgiiMockServer("accepted");
    expect(srv.consultarEstado("T").trackId).toBe("T");
  });
});

describe("createDgiiMockServer — escenarios de error", () => {
  const cases: Array<[DgiiMockScenario, number | "timeout"]> = [
    ["schema_error_400", 400],
    ["forbidden_403", 403],
    ["rate_limited_429", 429],
    ["server_error_5xx", 500],
    ["timeout", "timeout"],
  ];
  it.each(cases)("recepción %s", (scenario, expected) => {
    const r = createDgiiMockServer(scenario).recepcion({ eNcf: "E320000000001" });
    if (expected === "timeout") expect(r.status).toBe(0);
    else expect(r.status).toBe(expected);
  });

  it("unauthorized_401 falla en validarSemilla", () => {
    const r = createDgiiMockServer("unauthorized_401").validarSemilla("<SignedSeed/>");
    expect(r.status).toBe(401);
  });

  it("validarSemilla sin semilla firmada → 401", () => {
    expect(createDgiiMockServer("accepted").validarSemilla("").status).toBe(401);
  });
});

describe("scenarioToLocalStatus", () => {
  it("mapea escenarios a estados locales", () => {
    expect(scenarioToLocalStatus("accepted")).toBe("accepted");
    expect(scenarioToLocalStatus("accepted_conditional")).toBe("accepted_conditional");
    expect(scenarioToLocalStatus("rejected")).toBe("rejected");
    expect(scenarioToLocalStatus("schema_error_400")).toBe("rejected");
    expect(scenarioToLocalStatus("timeout")).toBe("error");
    expect(scenarioToLocalStatus("server_error_5xx")).toBe("error");
  });
});
