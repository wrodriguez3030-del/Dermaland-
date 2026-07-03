import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import forge from "node-forge";
import { mapProformaToEcfInput } from "./proforma-to-input";
import { buildEcfXml } from "./builder";
import { signEcfXml } from "./signer";
import { validateEcfXml } from "./validator";
import type { Proforma, SaleItem } from "@/types";

function makeItem(overrides: Partial<SaleItem> = {}): SaleItem {
  const unitPrice = 118;
  const itbisRate = 18;
  const quantity = 2;
  return {
    productId: "prd_001",
    productSku: "BIO-AM-50",
    productName: "Bioderma Agua Micelar 50ml",
    lotId: "lot_x",
    lotNumber: "LB001",
    quantity,
    unitPrice,
    itbisRate,
    discount: 0,
    subtotal: (unitPrice / (1 + itbisRate / 100)) * quantity,
    itbis: ((unitPrice / (1 + itbisRate / 100)) * (itbisRate / 100)) * quantity,
    total: unitPrice * quantity,
    ...overrides,
  };
}

function makeProforma(overrides: Partial<Proforma> = {}): Proforma {
  const item = makeItem();
  const now = "2026-05-17T14:30:00.000Z";
  return {
    id: "prof_xyz",
    businessId: "biz_dermaland",
    branchId: "br_santiago",
    number: "PROF-2026-00187",
    customerId: undefined,
    customerName: "Distrimedica SRL",
    customerDocument: "1-31-23456-7", // con guiones — el mapper debe normalizar
    customerPhone: "+18095551111",
    cashierId: "usr_cashier",
    cashierName: "Rosa Peralta",
    items: [item],
    subtotal: item.subtotal,
    discount: 0,
    itbis: item.itbis,
    total: item.total,
    status: "paid",
    payments: [],
    paid: item.total,
    balance: 0,
    documentKind: "invoice",
    ecfType: "32",
    sequenceType: "consumo",
    billingType: "consumo",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("mapProformaToEcfInput — campos básicos", () => {
  it("sintetiza eNcf de 13 chars con prefijo E + tipo (2) + 10 dígitos", () => {
    const input = mapProformaToEcfInput(makeProforma({ ecfType: "32" }));
    expect(input.eNcf).toMatch(/^E32\d{10}$/);
    expect(input.eNcf).toHaveLength(13);
  });

  it("usa proforma.ecfType cuando está presente", () => {
    const i31 = mapProformaToEcfInput(makeProforma({ ecfType: "31" }));
    const i32 = mapProformaToEcfInput(makeProforma({ ecfType: "32" }));
    expect(i31.tipoEcf).toBe("31");
    expect(i32.tipoEcf).toBe("32");
  });

  it("aplica defaultTipoEcf cuando proforma no tiene ecfType", () => {
    const sin = mapProformaToEcfInput(
      makeProforma({ ecfType: undefined }),
      { defaultTipoEcf: "32" },
    );
    expect(sin.tipoEcf).toBe("32");
  });

  it("normaliza RNC del cliente (strip guiones)", () => {
    const input = mapProformaToEcfInput(
      makeProforma({ customerDocument: "1-31-23456-7", ecfType: "31" }),
    );
    expect(input.comprador.rncComprador).toBe("131234567");
  });

  it("e-CF 32 sin RNC válido → comprador sin RNCComprador", () => {
    const input = mapProformaToEcfInput(
      makeProforma({ customerDocument: undefined, ecfType: "32" }),
    );
    expect(input.comprador.rncComprador).toBeUndefined();
  });

  it("hardcodea emisor DermaLand SRL", () => {
    const input = mapProformaToEcfInput(makeProforma());
    expect(input.emisor.rncEmisor).toBe("13259077503");
    expect(input.emisor.razonSocialEmisor).toBe("DermaLand SRL");
  });
});

describe("mapProformaToEcfInput — items", () => {
  it("precioUnitarioItem es pre-ITBIS (unitPrice / (1 + tasa/100))", () => {
    const input = mapProformaToEcfInput(makeProforma());
    expect(input.items[0]?.precioUnitarioItem).toBeCloseTo(100, 2);
  });

  it("montoItem usa subtotal (pre-ITBIS post-descuento)", () => {
    const input = mapProformaToEcfInput(makeProforma());
    expect(input.items[0]?.montoItem).toBeCloseTo(200, 2);
  });

  it("indicadorFacturacion: 18% → 1, 16% → 2, 0% → 4", () => {
    const v18 = mapProformaToEcfInput(
      makeProforma({ items: [makeItem({ itbisRate: 18 })] }),
    );
    const v16 = mapProformaToEcfInput(
      makeProforma({ items: [makeItem({ itbisRate: 16 })] }),
    );
    const v0 = mapProformaToEcfInput(
      makeProforma({ items: [makeItem({ itbisRate: 0 })] }),
    );
    expect(v18.items[0]?.indicadorFacturacion).toBe(1);
    expect(v16.items[0]?.indicadorFacturacion).toBe(2);
    expect(v0.items[0]?.indicadorFacturacion).toBe(4);
  });

  it("incluye descripcionItem con lote + SKU cuando existe lotNumber", () => {
    const input = mapProformaToEcfInput(makeProforma());
    expect(input.items[0]?.descripcionItem).toContain("LB001");
    expect(input.items[0]?.descripcionItem).toContain("BIO-AM-50");
  });

  it("propaga descuento como descuentoMonto cuando > 0", () => {
    const input = mapProformaToEcfInput(
      makeProforma({ items: [makeItem({ discount: 5 })] }),
    );
    expect(input.items[0]?.descuentoMonto).toBe(5);
  });

  it("rechaza proforma con items vacíos", () => {
    expect(() => mapProformaToEcfInput(makeProforma({ items: [] }))).toThrow(
      /no tiene ítems/i,
    );
  });
});

describe("mapProformaToEcfInput — totales", () => {
  it("mapea subtotal/itbis/total de la proforma", () => {
    const p = makeProforma();
    const input = mapProformaToEcfInput(p);
    expect(input.totales.montoGravadoTotal).toBeCloseTo(p.subtotal, 2);
    expect(input.totales.totalItbis).toBeCloseTo(p.itbis, 2);
    expect(input.totales.montoTotal).toBeCloseTo(p.total, 2);
  });

  it("emite MontoGravadoI1 junto a TotalITBIS1 (validación aritmética DGII)", () => {
    const input = mapProformaToEcfInput(makeProforma());
    expect(input.totales.montoGravadoI1).toBeCloseTo(200, 2);
    expect(input.totales.totalItbis1).toBeCloseTo(36, 2);
    expect(input.totales.itbis1).toBe(18);
    // TotalITBIS1 ≈ MontoGravadoI1 × 18%
    expect(input.totales.totalItbis1).toBeCloseTo(
      (input.totales.montoGravadoI1 ?? 0) * 0.18,
      2,
    );
  });

  it("líneas exentas van a MontoExento y NO inflan el gravado", () => {
    const gravada = makeItem(); // 200 pre-ITBIS, 36 ITBIS
    const exenta = makeItem({
      itbisRate: 0,
      unitPrice: 50,
      quantity: 1,
      subtotal: 50,
      itbis: 0,
      total: 50,
    });
    const p = makeProforma({
      items: [gravada, exenta],
      subtotal: 250,
      itbis: 36,
      total: 286,
    });
    const input = mapProformaToEcfInput(p);
    expect(input.totales.montoExento).toBeCloseTo(50, 2);
    expect(input.totales.montoGravadoTotal).toBeCloseTo(200, 2);
    expect(input.totales.montoGravadoI1).toBeCloseTo(200, 2);
    expect(input.totales.totalItbis1).toBeCloseTo(36, 2);
  });

  it("proforma 100% exenta: sin gravado ni ITBIS, solo MontoExento", () => {
    const exenta = makeItem({
      itbisRate: 0,
      unitPrice: 50,
      quantity: 2,
      subtotal: 100,
      itbis: 0,
      total: 100,
    });
    const p = makeProforma({ items: [exenta], subtotal: 100, itbis: 0, total: 100 });
    const input = mapProformaToEcfInput(p);
    expect(input.totales.montoExento).toBeCloseTo(100, 2);
    expect(input.totales.montoGravadoTotal).toBeUndefined();
    expect(input.totales.totalItbis1).toBeUndefined();
    expect(input.totales.itbis1).toBeUndefined();
  });

  it("identidad por línea: cantidad × precio − descuento == montoItem (con descuento)", () => {
    const conDesc = makeItem({ discount: 7.33, subtotal: 192.67 });
    const input = mapProformaToEcfInput(makeProforma({ items: [conDesc] }));
    const it0 = input.items[0]!;
    expect(
      it0.cantidadItem * it0.precioUnitarioItem - (it0.descuentoMonto ?? 0),
    ).toBeCloseTo(it0.montoItem, 2);
  });
});

describe("mapProformaToEcfInput — integración con pipeline", () => {
  let XSDs: Record<"31" | "32", string>;
  let dummy: { certificatePem: string; privateKeyPem: string };

  beforeAll(() => {
    XSDs = {
      "31": fs.readFileSync(
        path.resolve(process.cwd(), "../..", "docs/dgii/xsd/e-CF-31-v1.0.xsd"),
        "utf8",
      ),
      "32": fs.readFileSync(
        path.resolve(process.cwd(), "../..", "docs/dgii/xsd/e-CF-32-v1.0.xsd"),
        "utf8",
      ),
    };
    const keys = forge.pki.rsa.generateKeyPair(1024);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = "01";
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
    const attrs: forge.pki.CertificateField[] = [
      { name: "commonName", value: "DermaLand Test" },
      { name: "countryName", value: "DO" },
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    dummy = {
      certificatePem: forge.pki.certificateToPem(cert),
      privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
    };
  });

  it("proforma e-CF 32 (consumidor final) → builder → signer → XSD 32 ✓", async () => {
    const p = makeProforma({
      ecfType: "32",
      customerDocument: undefined,
      customerName: "Walk-in / Consumidor final",
    });
    const input = mapProformaToEcfInput(p);
    const xml = buildEcfXml(input);
    const { xml: signed } = signEcfXml({
      xml,
      certificatePem: dummy.certificatePem,
      privateKeyPem: dummy.privateKeyPem,
    });
    const result = await validateEcfXml({ xml: signed, xsd: XSDs["32"] });
    if (!result.valid) console.error("XSD 32 errors:", result.errors);
    expect(result.valid).toBe(true);
  });

  it("proforma e-CF 31 (crédito fiscal con RNC) → builder → signer → XSD 31 ✓", async () => {
    const p = makeProforma({
      ecfType: "31",
      billingType: "credito_fiscal",
      customerDocument: "131234567",
    });
    const input = mapProformaToEcfInput(p);
    const xml = buildEcfXml(input);
    const { xml: signed } = signEcfXml({
      xml,
      certificatePem: dummy.certificatePem,
      privateKeyPem: dummy.privateKeyPem,
    });
    const result = await validateEcfXml({ xml: signed, xsd: XSDs["31"] });
    if (!result.valid) console.error("XSD 31 errors:", result.errors);
    expect(result.valid).toBe(true);
  });
});
