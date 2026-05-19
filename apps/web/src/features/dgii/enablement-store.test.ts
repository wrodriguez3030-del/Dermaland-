// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  listProgress,
  upsertProgress,
  setStepStatus,
  toggleChecklistItem,
  resetEnablement,
  computeProgressPercent,
  type EnablementProgress,
} from "./enablement-store";

beforeEach(() => {
  if (typeof window !== "undefined") {
    window.localStorage.clear();
  }
});

function makeProgress(
  stepId: EnablementProgress["stepId"],
  overrides: Partial<EnablementProgress> = {},
): EnablementProgress {
  return {
    stepId,
    status: "pending",
    updatedAt: new Date().toISOString(),
    checklist: [
      { id: "a", label: "Item A", done: false },
      { id: "b", label: "Item B", done: false },
    ],
    ...overrides,
  };
}

describe("enablement-store", () => {
  it("listProgress devuelve [] cuando no hay datos", () => {
    expect(listProgress()).toEqual([]);
  });

  it("upsertProgress agrega un paso nuevo", () => {
    upsertProgress(makeProgress("postulacion"));
    expect(listProgress()).toHaveLength(1);
  });

  it("upsertProgress reemplaza (no duplica) por stepId", () => {
    upsertProgress(makeProgress("postulacion", { status: "pending" }));
    upsertProgress(makeProgress("postulacion", { status: "in_progress" }));
    const list = listProgress();
    expect(list).toHaveLength(1);
    expect(list[0]?.status).toBe("in_progress");
  });

  it("setStepStatus inicializa si no existe el paso", () => {
    setStepStatus("pruebas_ecf", "in_progress", { completedBy: "demo" });
    const list = listProgress();
    expect(list).toHaveLength(1);
    expect(list[0]?.status).toBe("in_progress");
    expect(list[0]?.completedBy).toBe("demo");
  });

  it("setStepStatus completed setea completedAt", () => {
    setStepStatus("postulacion", "completed", { completedBy: "demo" });
    const p = listProgress().find((x) => x.stepId === "postulacion");
    expect(p?.completedAt).toBeTruthy();
  });

  it("setStepStatus blocked guarda blockerReason", () => {
    setStepStatus("url_produccion", "blocked", {
      blockerReason: "Fase G no autorizada",
    });
    const p = listProgress().find((x) => x.stepId === "url_produccion");
    expect(p?.blockerReason).toBe("Fase G no autorizada");
  });

  it("setStepStatus que sale de blocked limpia blockerReason", () => {
    setStepStatus("url_produccion", "blocked", { blockerReason: "x" });
    setStepStatus("url_produccion", "in_progress");
    const p = listProgress().find((x) => x.stepId === "url_produccion");
    expect(p?.blockerReason).toBeUndefined();
  });

  it("toggleChecklistItem alterna done", () => {
    upsertProgress(makeProgress("postulacion"));
    toggleChecklistItem("postulacion", "a");
    let p = listProgress().find((x) => x.stepId === "postulacion");
    expect(p?.checklist.find((c) => c.id === "a")?.done).toBe(true);
    toggleChecklistItem("postulacion", "a");
    p = listProgress().find((x) => x.stepId === "postulacion");
    expect(p?.checklist.find((c) => c.id === "a")?.done).toBe(false);
  });

  it("toggleChecklistItem es no-op si el paso no existe", () => {
    toggleChecklistItem("postulacion", "a");
    expect(listProgress()).toHaveLength(0);
  });

  it("resetEnablement limpia todo", () => {
    upsertProgress(makeProgress("postulacion"));
    upsertProgress(makeProgress("pruebas_ecf"));
    resetEnablement();
    expect(listProgress()).toEqual([]);
  });

  it("computeProgressPercent devuelve 0 si total es 0", () => {
    expect(computeProgressPercent(0, [])).toBe(0);
  });

  it("computeProgressPercent calcula porcentaje sobre completados", () => {
    const list: EnablementProgress[] = [
      makeProgress("postulacion", { status: "completed" }),
      makeProgress("pruebas_ecf", { status: "completed" }),
      makeProgress("representaciones", { status: "in_progress" }),
    ];
    // 2 completados de 6 = 33%
    expect(computeProgressPercent(6, list)).toBe(33);
  });

  it("computeProgressPercent ignora estados no completados", () => {
    const list: EnablementProgress[] = [
      makeProgress("postulacion", { status: "blocked" }),
      makeProgress("pruebas_ecf", { status: "in_progress" }),
    ];
    expect(computeProgressPercent(6, list)).toBe(0);
  });
});
