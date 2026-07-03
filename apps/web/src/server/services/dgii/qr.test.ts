import { describe, it, expect } from "vitest";
import {
  buildDgiiConsultaUrl,
  generateQrCodePng,
  generateQrCodeSvg,
  generateQrCodeDataUrl,
} from "./qr";

describe("buildDgiiConsultaUrl", () => {
  // Mediodía AST del 17-05-2026 (16:00 UTC) — determinístico en cualquier TZ.
  const fixedDate = new Date(Date.UTC(2026, 4, 17, 16, 0, 0));
  const fixedFirma = "17-05-2026 14:30:45";

  it("produce URL de la PÁGINA de consulta (no endpoint de API) por ambiente", () => {
    const url = buildDgiiConsultaUrl({
      ambiente: "testecf",
      rncEmisor: "13259077503",
      rncComprador: "131234567",
      eNcf: "E310000000001",
      fechaEmision: fixedDate,
      montoTotal: 1180,
      fechaFirma: fixedFirma,
      codigoSeguridad: "ABC123",
    });
    expect(url).toContain("https://ecf.dgii.gov.do/testecf/ConsultaTimbre?");
    expect(url).not.toContain("/api/");
  });

  it("incluye los parámetros requeridos por DGII (con FechaFirma y CodigoSeguridad)", () => {
    const url = buildDgiiConsultaUrl({
      ambiente: "ecf",
      rncEmisor: "13259077503",
      rncComprador: "131234567",
      eNcf: "E310000000001",
      fechaEmision: fixedDate,
      montoTotal: 1180.5,
      fechaFirma: fixedFirma,
      codigoSeguridad: "ABC123",
    });
    const u = new URL(url);
    expect(u.searchParams.get("RncEmisor")).toBe("13259077503");
    expect(u.searchParams.get("RncComprador")).toBe("131234567");
    expect(u.searchParams.get("ENCF")).toBe("E310000000001");
    expect(u.searchParams.get("FechaEmision")).toBe("17-05-2026");
    expect(u.searchParams.get("MontoTotal")).toBe("1180.50");
    expect(u.searchParams.get("FechaFirma")).toBe(fixedFirma);
    expect(u.searchParams.get("CodigoSeguridad")).toBe("ABC123");
  });

  it("lanza si falta fechaFirma en la consulta general", () => {
    expect(() =>
      buildDgiiConsultaUrl({
        ambiente: "ecf",
        rncEmisor: "13259077503",
        rncComprador: "131234567",
        eNcf: "E310000000001",
        fechaEmision: fixedDate,
        montoTotal: 1180,
        codigoSeguridad: "ABC123",
      }),
    ).toThrow(/fechaFirma/);
  });

  it("consumo (32) < RD$250,000 usa la consulta reducida FC sin fechas ni comprador", () => {
    const url = buildDgiiConsultaUrl({
      ambiente: "testecf",
      rncEmisor: "13259077503",
      eNcf: "E320000000001",
      fechaEmision: fixedDate,
      montoTotal: 1180,
      codigoSeguridad: "XYZ000",
    });
    const u = new URL(url);
    expect(url).toContain("https://fc.dgii.gov.do/testecf/ConsultaTimbreFC?");
    expect(u.searchParams.get("RncEmisor")).toBe("13259077503");
    expect(u.searchParams.get("ENCF")).toBe("E320000000001");
    expect(u.searchParams.get("MontoTotal")).toBe("1180.00");
    expect(u.searchParams.get("CodigoSeguridad")).toBe("XYZ000");
    expect(u.searchParams.has("RncComprador")).toBe(false);
    expect(u.searchParams.has("FechaEmision")).toBe(false);
    expect(u.searchParams.has("FechaFirma")).toBe(false);
  });

  it("consumo (32) >= RD$250,000 usa la consulta general", () => {
    const url = buildDgiiConsultaUrl({
      ambiente: "ecf",
      rncEmisor: "13259077503",
      eNcf: "E320000000001",
      fechaEmision: fixedDate,
      montoTotal: 250_000,
      fechaFirma: fixedFirma,
      codigoSeguridad: "XYZ000",
    });
    expect(url).toContain("https://ecf.dgii.gov.do/ecf/ConsultaTimbre?");
  });

  it("acepta fechaFirma como Date y la formatea dd-MM-yyyy HH:mm:ss", () => {
    const url = buildDgiiConsultaUrl({
      ambiente: "ecf",
      rncEmisor: "13259077503",
      rncComprador: "131234567",
      eNcf: "E310000000001",
      fechaEmision: fixedDate,
      montoTotal: 100,
      fechaFirma: new Date(Date.UTC(2026, 4, 17, 18, 30, 45)), // 14:30:45 AST
      codigoSeguridad: "ABC123",
    });
    const u = new URL(url);
    expect(u.searchParams.get("FechaFirma")).toBe("17-05-2026 14:30:45");
  });

  it("path por ambiente: certecf vs ecf vs testecf", () => {
    const build = (ambiente: "testecf" | "certecf" | "ecf") =>
      buildDgiiConsultaUrl({
        ambiente,
        rncEmisor: "130000001",
        rncComprador: "131234567",
        eNcf: "E310000000001",
        fechaEmision: fixedDate,
        montoTotal: 100,
        fechaFirma: fixedFirma,
        codigoSeguridad: "ABC123",
      });
    expect(build("testecf")).toContain("/testecf/");
    expect(build("certecf")).toContain("/certecf/");
    expect(build("ecf")).toContain("/ecf/");
  });
});

describe("generateQrCodePng", () => {
  it("retorna un Buffer no vacío con magic bytes PNG", async () => {
    const buf = await generateQrCodePng("https://example.com");
    expect(buf.byteLength).toBeGreaterThan(0);
    // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50);
    expect(buf[2]).toBe(0x4e);
    expect(buf[3]).toBe(0x47);
  });

  it("respeta opciones de scale y margin", async () => {
    const small = await generateQrCodePng("hi", { scale: 2, margin: 0 });
    const big = await generateQrCodePng("hi", { scale: 10, margin: 4 });
    // No comparamos bytes exactos (compresión PNG), pero scale=10 debería
    // producir bastante más bytes que scale=2.
    expect(big.byteLength).toBeGreaterThan(small.byteLength);
  });
});

describe("generateQrCodeSvg", () => {
  it("retorna SVG válido empezando con <svg", async () => {
    const svg = await generateQrCodeSvg("https://example.com");
    expect(svg.trim().startsWith("<?xml") || svg.trim().startsWith("<svg")).toBe(
      true,
    );
    expect(svg).toContain("</svg>");
  });
});

describe("generateQrCodeDataUrl", () => {
  it("retorna data URL base64 PNG", async () => {
    const data = await generateQrCodeDataUrl("https://example.com");
    expect(data.startsWith("data:image/png;base64,")).toBe(true);
    expect(data.length).toBeGreaterThan(50);
  });
});
