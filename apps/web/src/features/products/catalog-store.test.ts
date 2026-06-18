// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  CATALOG_BACKEND,
  saveBrand, saveCategory, saveLaboratory,
} from "./catalog-store";

describe("catalog-store (modo local)", () => {
  it("CATALOG_BACKEND es 'local' por defecto", () => {
    expect(CATALOG_BACKEND).toBe("local");
  });
  it("saveBrand local devuelve ok con la marca", async () => {
    const res = await saveBrand("create", { name: "MARCA NUEVA" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.item.name).toBe("MARCA NUEVA");
  });
  it("saveCategory local valida nombre requerido", async () => {
    const res = await saveCategory("create", { name: "" });
    expect(res.ok).toBe(false);
  });
  it("saveLaboratory local acepta country", async () => {
    const res = await saveLaboratory("create", { name: "LAB", country: "España" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.item.country).toBe("España");
  });
});
