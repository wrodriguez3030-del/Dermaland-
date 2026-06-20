import { describe, it, expect } from "vitest";
import {
  cleanName,
  inferBrand,
  inferForm,
  inferContent,
  parseProductName,
} from "./product-parser";

describe("cleanName", () => {
  it("normaliza mayúsculas conservando unidades", () => {
    expect(cleanName("ACEITE ROSA MOSQUETA 118 ML")).toBe("Aceite Rosa Mosqueta 118 ML");
  });
  it("colapsa espacios", () => {
    expect(cleanName("CREMA   FACIAL")).toBe("Crema Facial");
  });
});

describe("inferBrand", () => {
  it("detecta La Roche-Posay", () => {
    expect(inferBrand("LA ROCHE-POSAY EFFACLAR GEL 200 ML")?.id).toBe("br_lrp");
  });
  it("detecta marca de una palabra", () => {
    expect(inferBrand("SESDERMA C-VIT SERUM 30 ML")?.id).toBe("br_sesderma");
  });
  it("sin marca conocida → undefined", () => {
    expect(inferBrand("ACEITE ROSA MOSQUETA 118 ML")).toBeUndefined();
  });
});

describe("inferForm", () => {
  it("detecta sérum, gel, crema, cápsula", () => {
    expect(inferForm("C-VIT SERUM 30 ML")).toBe("serum");
    expect(inferForm("EFFACLAR GEL 200 ML")).toBe("gel");
    expect(inferForm("CICASTIM CREMA 20 ML")).toBe("crema");
    expect(inferForm("HELIOCARE ORAL 30 CAPSULAS")).toBe("capsula");
  });
});

describe("inferContent", () => {
  it("extrae ml / gr / cápsulas", () => {
    expect(inferContent("CREMA 40 ML")).toBe("40 ml");
    expect(inferContent("LABIAL 9.2 GR")).toBe("9.2 g");
    expect(inferContent("ORAL 30 CAPSULAS")).toBe("30 cápsulas");
  });
  it("sin tamaño → undefined", () => {
    expect(inferContent("CREMA FACIAL")).toBeUndefined();
  });
});

describe("parseProductName", () => {
  it("clasifica protector solar como uso protección solar (día)", () => {
    const p = parseProductName("ISDIN FOTOPROTECTOR FUSION WATER SPF 50 50 ML");
    expect(p.categoryId).toBe("cat_solar");
    expect(p.useType).toBe("Protección solar");
    expect(p.timeOfUse).toBe("dia");
    expect(p.brandId).toBe("br_isdin");
    expect(p.content).toBe("50 ml");
  });
  it("clasifica limpiador como limpieza facial", () => {
    const p = parseProductName("AVENE NETO GEL LIMPIADOR 200 ML");
    expect(p.useType).toBe("Limpieza facial");
    expect(p.brandId).toBe("br_avene");
  });
  it("genera shortName, beneficios, modo de uso, tip y keywords", () => {
    const p = parseProductName("SESDERMA C-VIT SERUM LIPOSOMAL 30 ML");
    expect(p.shortName.length).toBeGreaterThan(0);
    expect(p.benefits.length).toBeGreaterThan(0);
    expect(p.modeOfUse).toMatch(/aplicar/i);
    expect(p.salesTip.length).toBeGreaterThan(0);
    expect(p.keywords).toContain("sesderma");
  });
  it("producto sin marca/categoría clara no rompe (cae a facial)", () => {
    const p = parseProductName("ACEITE ROSA MOSQUETA 118 ML");
    expect(p.categoryId).toBe("cat_facial");
    expect(p.brandId).toBeUndefined();
  });
});
