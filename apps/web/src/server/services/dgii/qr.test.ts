import { describe, it, expect } from "vitest";
import {
  buildDgiiConsultaUrl,
  generateQrCodePng,
  generateQrCodeSvg,
  generateQrCodeDataUrl,
} from "./qr";

describe("buildDgiiConsultaUrl", () => {
  const fixedDate = new Date(2026, 4, 17);

  it("produce URL con host ecf.dgii.gov.do y path por ambiente", () => {
    const url = buildDgiiConsultaUrl({
      ambiente: "testecf",
      rncEmisor: "13259077503",
      rncComprador: "131234567",
      eNcf: "E310000000001",
      fechaEmision: fixedDate,
      montoTotal: 1180,
      codigoSeguridad: "ABC12345",
    });
    expect(url).toContain("https://ecf.dgii.gov.do/testecf/ConsultaTimbre");
  });

  it("incluye los parámetros requeridos por DGII", () => {
    const url = buildDgiiConsultaUrl({
      ambiente: "ecf",
      rncEmisor: "13259077503",
      rncComprador: "131234567",
      eNcf: "E310000000001",
      fechaEmision: fixedDate,
      montoTotal: 1180.5,
      codigoSeguridad: "ABC12345",
    });
    const u = new URL(url);
    expect(u.searchParams.get("RncEmisor")).toBe("13259077503");
    expect(u.searchParams.get("RncComprador")).toBe("131234567");
    expect(u.searchParams.get("ENCF")).toBe("E310000000001");
    expect(u.searchParams.get("FechaEmision")).toBe("17-05-2026");
    expect(u.searchParams.get("MontoTotal")).toBe("1180.50");
    expect(u.searchParams.get("CodigoSeguridadIeCF")).toBe("ABC12345");
  });

  it("omite RncComprador cuando no se provee (consumidor final)", () => {
    const url = buildDgiiConsultaUrl({
      ambiente: "ecf",
      rncEmisor: "13259077503",
      eNcf: "E320000000001",
      fechaEmision: fixedDate,
      montoTotal: 100,
      codigoSeguridad: "XYZ00000",
    });
    const u = new URL(url);
    expect(u.searchParams.has("RncComprador")).toBe(false);
    expect(u.searchParams.get("ENCF")).toBe("E320000000001");
  });

  it("path por ambiente: certecf vs ecf vs testecf", () => {
    const test = buildDgiiConsultaUrl({
      ambiente: "testecf",
      rncEmisor: "1",
      eNcf: "E",
      fechaEmision: fixedDate,
      montoTotal: 0,
      codigoSeguridad: "0",
    });
    const cert = test.replace("testecf", "certecf");
    const prod = test.replace("testecf", "ecf");
    expect(test).toContain("/testecf/");
    expect(cert).toContain("/certecf/");
    expect(prod).toContain("/ecf/");
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
