// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  listNumberings,
  createNumbering,
  updateNumbering,
  setNumberingActive,
  setPreferred,
  deleteNumbering,
  reserveNext,
  remaining,
  effectiveStatus,
  clearLocalNumberings,
  type NumberingInput,
} from "./numbering-store";
import { mockBusiness } from "@/lib/mock-data/tenancy";

function input(over: Partial<NumberingInput> = {}): NumberingInput {
  return {
    name: "Test",
    documentType: "consumo",
    prefix: "T01",
    rangeStart: 1,
    rangeEnd: 100,
    nextNumber: 1,
    environment: "mock",
    isElectronic: false,
    isPreferred: false,
    status: "active",
    ...over,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  clearLocalNumberings();
});

describe("CRUD numeraciones", () => {
  it("lista el seed", () => {
    expect(listNumberings().length).toBeGreaterThan(0);
  });
  it("crea una numeración", () => {
    const r = createNumbering(input());
    expect(r.ok).toBe(true);
  });
  it("rechaza prefijo+tipo+ambiente duplicado", () => {
    createNumbering(input({ prefix: "DUP" }));
    const r = createNumbering(input({ prefix: "DUP" }));
    expect(r.ok).toBe(false);
  });
  it("rechaza siguiente número fuera de rango", () => {
    const r = createNumbering(input({ rangeStart: 1, rangeEnd: 10, nextNumber: 99 }));
    expect(r.ok).toBe(false);
  });
  it("rechaza rango final menor al inicial", () => {
    const r = createNumbering(input({ rangeStart: 100, rangeEnd: 10, nextNumber: 100 }));
    expect(r.ok).toBe(false);
  });
  it("edita una numeración", () => {
    const r = createNumbering(input({ prefix: "ED1" }));
    if (!r.ok) throw new Error("setup");
    const u = updateNumbering(r.numbering.id, { name: "Editado" });
    expect(u.ok).toBe(true);
    if (u.ok) expect(u.numbering.name).toBe("Editado");
  });
  it("inactiva una numeración", () => {
    const r = createNumbering(input({ prefix: "IN1" }));
    if (!r.ok) throw new Error("setup");
    setNumberingActive(r.numbering.id, false);
    expect(effectiveStatus(listNumberings().find((n) => n.id === r.numbering.id)!)).toBe(
      "inactive",
    );
  });
});

describe("preferida única por tipo+ambiente", () => {
  it("no permite crear dos preferidas activas del mismo tipo+ambiente", () => {
    const a = createNumbering(
      input({ documentType: "gubernamental", prefix: "P1", isPreferred: true }),
    );
    expect(a.ok).toBe(true);
    const r = createNumbering(
      input({ documentType: "gubernamental", prefix: "P2", isPreferred: true }),
    );
    expect(r.ok).toBe(false);
  });
  it("setPreferred mueve la preferencia", () => {
    const a = createNumbering(
      input({ documentType: "gubernamental", prefix: "PA", isPreferred: true }),
    );
    const b = createNumbering(
      input({ documentType: "gubernamental", prefix: "PB", isPreferred: false }),
    );
    if (!a.ok || !b.ok) throw new Error("setup");
    setPreferred(b.numbering.id);
    const list = listNumberings();
    expect(list.find((n) => n.id === a.numbering.id)!.isPreferred).toBe(false);
    expect(list.find((n) => n.id === b.numbering.id)!.isPreferred).toBe(true);
  });
});

describe("eliminar", () => {
  it("permite eliminar si no fue usada", () => {
    const r = createNumbering(input({ prefix: "DEL", nextNumber: 1, rangeStart: 1 }));
    if (!r.ok) throw new Error("setup");
    expect(deleteNumbering(r.numbering.id).ok).toBe(true);
  });
  it("bloquea eliminar si ya fue usada", () => {
    const r = createNumbering(input({ prefix: "USED", rangeStart: 1, nextNumber: 5 }));
    if (!r.ok) throw new Error("setup");
    const d = deleteNumbering(r.numbering.id);
    expect(d.ok).toBe(false);
  });
});

describe("reserva de número", () => {
  it("reserva e incrementa el siguiente número", () => {
    const r = createNumbering(
      input({ documentType: "nota_credito", prefix: "NC", isPreferred: true, nextNumber: 7, rangeStart: 1, rangeEnd: 100 }),
    );
    if (!r.ok) throw new Error("setup");
    const res = reserveNext("nota_credito", "mock");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toBe(7);
      expect(res.formatted).toContain("NC");
    }
    const after = listNumberings().find((n) => n.id === r.numbering.id)!;
    expect(after.nextNumber).toBe(8);
  });
  it("bloquea si no hay numeración para el tipo", () => {
    const res = reserveNext("gubernamental", "mock");
    expect(res.ok).toBe(false);
  });
  it("bloquea si está vencida", () => {
    createNumbering(
      input({ documentType: "exportacion", prefix: "EX", isPreferred: true, endDate: "2020-01-01" }),
    );
    const res = reserveNext("exportacion", "mock");
    expect(res.ok).toBe(false);
  });
  it("bloquea si está agotada (supera el rango)", () => {
    const r = createNumbering(
      input({ documentType: "regimen_especial", prefix: "RE", isPreferred: true, rangeStart: 1, rangeEnd: 3, nextNumber: 4 }),
    );
    if (!r.ok) throw new Error("setup");
    expect(remaining(r.numbering)).toBe(0);
    const res = reserveNext("regimen_especial", "mock");
    expect(res.ok).toBe(false);
  });
  it("bloquea si está inactiva", () => {
    const r = createNumbering(
      input({ documentType: "nota_debito", prefix: "ND", isPreferred: true, status: "inactive" }),
    );
    if (!r.ok) throw new Error("setup");
    const res = reserveNext("nota_debito", "mock");
    expect(res.ok).toBe(false);
  });
});

describe("scoping", () => {
  it("toda numeración creada lleva el business del negocio", () => {
    const r = createNumbering(input({ prefix: "SCP" }));
    if (r.ok) expect(r.numbering.businessId).toBe(mockBusiness.id);
  });
});
