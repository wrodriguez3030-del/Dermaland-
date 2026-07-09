import { describe, it, expect } from "vitest";
import {
  normalizeDigits,
  digitsIlikePattern,
  sanitizeTerm,
  hasEnoughChars,
  classifyQuery,
  productHref,
  customerHref,
  documentHref,
  lotHref,
  customerDisplayName,
  buildGroups,
} from "./search-core";
import type { SearchResultItem } from "./search-types";

describe("normalizeDigits", () => {
  it("teléfono formateado y sin formato dan el mismo resultado", () => {
    expect(normalizeDigits("829-714-1975")).toBe("8297141975");
    expect(normalizeDigits("8297141975")).toBe("8297141975");
    expect(normalizeDigits("(829) 714-1975")).toBe("8297141975");
  });
  it("cédula formateada y sin formato dan el mismo resultado", () => {
    expect(normalizeDigits("031-0327428-2")).toBe("03103274282");
    expect(normalizeDigits("03103274282")).toBe("03103274282");
  });
  it("descarta letras y símbolos", () => {
    expect(normalizeDigits("RNC 1-31-12345-6")).toBe("131123456");
  });
});

describe("digitsIlikePattern — matchea ignorando separadores", () => {
  it("intercala % entre dígitos para tolerar guiones/espacios", () => {
    expect(digitsIlikePattern("8297141975")).toBe("%8%2%9%7%1%4%1%9%7%5%");
  });
  it("cadena vacía devuelve null (no filtra)", () => {
    expect(digitsIlikePattern("")).toBeNull();
    expect(digitsIlikePattern("abc")).toBeNull();
  });
});

describe("sanitizeTerm — evita romper el filtro PostgREST", () => {
  it("quita comas y porcentajes del término", () => {
    expect(sanitizeTerm("100%, algo")).toBe("100 algo");
    expect(sanitizeTerm("  ISDIN  ")).toBe("ISDIN");
  });
});

describe("hasEnoughChars", () => {
  it("exige mínimo 2 caracteres no vacíos", () => {
    expect(hasEnoughChars("a")).toBe(false);
    expect(hasEnoughChars(" a ")).toBe(false);
    expect(hasEnoughChars("ab")).toBe(true);
    expect(hasEnoughChars("  ")).toBe(false);
  });
});

describe("classifyQuery — pistas para optimizar qué entidades consultar", () => {
  it("SKU DERM-000201", () => {
    const c = classifyQuery("DERM-000201");
    expect(c.looksLikeSku).toBe(true);
  });
  it("NCF B0200001247", () => {
    const c = classifyQuery("B0200001247");
    expect(c.looksLikeDocument).toBe(true);
  });
  it("e-NCF E3200000095", () => {
    expect(classifyQuery("E3200000095").looksLikeDocument).toBe(true);
  });
  it("proforma PROF-2026-89236", () => {
    expect(classifyQuery("PROF-2026-89236").looksLikeDocument).toBe(true);
  });
  it("barcode 8470001834561 es numérico largo", () => {
    const c = classifyQuery("8470001834561");
    expect(c.isNumeric).toBe(true);
    expect(c.digits.length).toBe(13);
  });
  it("texto libre ISDIN no es numérico ni documento", () => {
    const c = classifyQuery("ISDIN");
    expect(c.isNumeric).toBe(false);
    expect(c.looksLikeDocument).toBe(false);
  });
});

describe("hrefs — rutas reales, nunca UUID en la UI", () => {
  it("producto → /productos/[id]", () => {
    expect(productHref("p1")).toBe("/productos/p1");
  });
  it("cliente → /clientes/[id]", () => {
    expect(customerHref("c1")).toBe("/clientes/c1");
  });
  it("factura (invoice) → /ventas/[id]; proforma → /proformas/[id]", () => {
    expect(documentHref("d1", "invoice")).toBe("/ventas/d1");
    expect(documentHref("d2", "proforma")).toBe("/proformas/d2");
  });
  it("lote → detalle del producto (nunca 404)", () => {
    expect(lotHref("prod9")).toBe("/productos/prod9");
  });
});

describe("customerDisplayName", () => {
  it("une nombre y apellido y recorta", () => {
    expect(customerDisplayName("Willian", "Rodríguez")).toBe("Willian Rodríguez");
    expect(customerDisplayName("Willian", "")).toBe("Willian");
  });
});

describe("buildGroups — agrupa, ordena y limita por categoría", () => {
  const items: SearchResultItem[] = [
    { kind: "product", id: "p1", title: "ISDIN A", href: "/productos/p1" },
    { kind: "product", id: "p2", title: "ISDIN B", href: "/productos/p2" },
    { kind: "customer", id: "c1", title: "Willian", href: "/clientes/c1" },
    { kind: "invoice", id: "d1", title: "B0200001247", href: "/ventas/d1" },
  ];
  it("agrupa por tipo con etiquetas y respeta el orden", () => {
    const res = buildGroups("ISDIN", items, 6);
    expect(res.total).toBe(4);
    expect(res.groups.map((g) => g.kind)).toEqual(["product", "customer", "invoice"]);
    expect(res.groups[0]!.label).toBe("Productos");
    expect(res.groups[0]!.items).toHaveLength(2);
  });
  it("aplica el límite por categoría", () => {
    const many: SearchResultItem[] = Array.from({ length: 10 }, (_, i) => ({
      kind: "product" as const,
      id: `p${i}`,
      title: `P${i}`,
      href: `/productos/p${i}`,
    }));
    const res = buildGroups("P", many, 6);
    expect(res.groups[0]!.items).toHaveLength(6);
    expect(res.total).toBe(10); // total refleja lo encontrado, no lo mostrado
  });
  it("sin resultados devuelve grupos vacíos y total 0", () => {
    const res = buildGroups("zzz", [], 6);
    expect(res.total).toBe(0);
    expect(res.groups).toEqual([]);
  });
});
