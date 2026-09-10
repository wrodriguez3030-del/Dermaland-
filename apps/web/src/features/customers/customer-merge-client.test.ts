import { describe, expect, it, vi } from "vitest";
import {
  fetchDuplicatePairs,
  mergeCustomersDryRun,
  mergeCustomers,
  describeMergeImpact,
} from "./customer-merge-client";

describe("fetchDuplicatePairs", () => {
  it("pide GET /api/customers/duplicates y devuelve los pares", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pairs: [{ a: { id: "a" }, b: { id: "b" }, confidence: "high", reasons: ["documento"] }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchDuplicatePairs();
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/customers/duplicates");
    expect(r).toEqual({ ok: true, pairs: [{ a: { id: "a" }, b: { id: "b" }, confidence: "high", reasons: ["documento"] }] });
  });

  it("error de red → { ok: false }", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const r = await fetchDuplicatePairs();
    expect(r.ok).toBe(false);
  });
});

describe("mergeCustomersDryRun / mergeCustomers", () => {
  it("dry run manda dryRun:true en el body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ moved: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    await mergeCustomersDryRun("p1", "d1");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/customers/merge");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      primaryId: "p1",
      duplicateId: "d1",
      dryRun: true,
    });
  });

  it("la fusión real NO manda dryRun", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ moved: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    await mergeCustomers("p1", "d1");
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ primaryId: "p1", duplicateId: "d1" });
  });

  it("respuesta no-ok → { ok: false, error }", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "No tienes permiso." }) }),
    );
    const r = await mergeCustomers("p1", "d1");
    expect(r).toEqual({ ok: false, error: "No tienes permiso." });
  });
});

describe("describeMergeImpact", () => {
  it("lista solo las tablas con conteo > 0, en español", () => {
    const texto = describeMergeImpact([
      { table: "alegra_invoices", count: 14 },
      { table: "ar_promises", count: 3 },
      { table: "client_auth_links", count: 0 },
      { table: "electronic_invoices", count: 0 },
      { table: "electronic_invoices_legacy_20260906", count: 0 },
      { table: "proformas", count: 0 },
      { table: "web_orders", count: 1 },
    ]);
    expect(texto).toBe("14 facturas migradas, 3 promesas de pago, 1 pedido web");
  });

  it("sin nada que mover, lo dice", () => {
    expect(describeMergeImpact([{ table: "proformas", count: 0 }])).toBe("Sin historial que mover.");
  });
});
