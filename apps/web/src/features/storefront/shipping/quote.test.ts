import { describe, expect, it } from "vitest";
import { DR_PROVINCES, findProvince, provinceName } from "./provinces";
import {
  deliverableProvinces,
  parseDeliveryAddress,
  quoteShipping,
  type ShippingRate,
} from "./quote";

const TARIFAS: ShippingRate[] = [
  { provinceSlug: "santiago", cost: 150, active: true },
  { provinceSlug: "distrito-nacional", cost: 350, active: true },
  { provinceSlug: "pedernales", cost: 900, active: false },
];

describe("provincias", () => {
  it("son las 32 demarcaciones de primer nivel del país", () => {
    // 31 provincias + Distrito Nacional.
    expect(DR_PROVINCES).toHaveLength(32);
  });

  it("no hay slugs repetidos", () => {
    const slugs = DR_PROVINCES.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("los slugs no llevan tildes ni mayúsculas: viajan en el pedido", () => {
    for (const p of DR_PROVINCES) {
      expect(p.slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("traduce slug a nombre y nunca al revés", () => {
    expect(provinceName("elias-pina")).toBe("Elías Piña");
    expect(provinceName("no-existe")).toBeNull();
    expect(findProvince("  santiago  ")?.name).toBe("Santiago");
  });
});

describe("quoteShipping", () => {
  it("cobra el envío de la provincia configurada", () => {
    const q = quoteShipping("santiago", TARIFAS);
    expect(q).toEqual({ ok: true, cost: 150, provinceName: "Santiago" });
  });

  it("una provincia SIN tarifa no se puede enviar", () => {
    // Fail-closed: sin coste configurado no se envía a RD$0, se dice que no se
    // llega. Cobrar cero por un envío es regalar el flete.
    const q = quoteShipping("samana", TARIFAS);
    expect(q.ok).toBe(false);
  });

  it("una provincia desactivada tampoco", () => {
    const q = quoteShipping("pedernales", TARIFAS);
    expect(q.ok).toBe(false);
  });

  it("una provincia que no existe tampoco", () => {
    expect(quoteShipping("narnia", TARIFAS).ok).toBe(false);
    expect(quoteShipping("", TARIFAS).ok).toBe(false);
  });

  it("sin ninguna tarifa configurada, no hay envío a ninguna parte", () => {
    expect(quoteShipping("santiago", []).ok).toBe(false);
    expect(deliverableProvinces([])).toEqual([]);
  });

  it("lista solo las provincias a las que SÍ se llega, ordenadas por nombre", () => {
    const lista = deliverableProvinces(TARIFAS);
    expect(lista.map((p) => p.slug)).toEqual(["distrito-nacional", "santiago"]);
    expect(lista[0]?.cost).toBe(350);
  });

  it("una tarifa negativa se ignora: no se paga por recibir", () => {
    const q = quoteShipping("santiago", [
      { provinceSlug: "santiago", cost: -50, active: true },
    ]);
    expect(q.ok).toBe(false);
  });

  it("un envío gratis SÍ es válido: cero es una decisión, ausente no lo es", () => {
    const q = quoteShipping("santiago", [
      { provinceSlug: "santiago", cost: 0, active: true },
    ]);
    expect(q).toEqual({ ok: true, cost: 0, provinceName: "Santiago" });
  });
});

describe("parseDeliveryAddress", () => {
  const VALIDA = {
    province: "santiago",
    sector: "  Los Jardines ",
    address: " Calle 5 #12 ",
    reference: " Frente al colmado ",
  };

  it("limpia los espacios de lo que teclea el cliente", () => {
    const r = parseDeliveryAddress(VALIDA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.sector).toBe("Los Jardines");
    expect(r.value.address).toBe("Calle 5 #12");
    expect(r.value.reference).toBe("Frente al colmado");
  });

  it("exige provincia, sector y dirección", () => {
    expect(parseDeliveryAddress({ ...VALIDA, province: "" }).ok).toBe(false);
    expect(parseDeliveryAddress({ ...VALIDA, sector: "  " }).ok).toBe(false);
    expect(parseDeliveryAddress({ ...VALIDA, address: "" }).ok).toBe(false);
  });

  it("la referencia es opcional: no todo el mundo tiene una", () => {
    const r = parseDeliveryAddress({ ...VALIDA, reference: "" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.reference).toBeUndefined();
  });

  it("mensajes para una persona, no volcados de zod", () => {
    const r = parseDeliveryAddress({});
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).not.toContain("invalid_type");
    expect(r.error.length).toBeLessThan(120);
  });
});
