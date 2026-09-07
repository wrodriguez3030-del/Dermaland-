import { describe, it, expect } from "vitest";
import {
  normalizarNombre,
  resolverVendedor,
} from "../../../../scripts/lib/vendedor-de-factura.mjs";

/**
 * De esta decisión sale la comisión de cada vendedora, así que se prueba sin
 * red y caso por caso.
 *
 * El fallo que motivó todo esto: la sincronización con Alegra escribía
 * `seller_name` pero no `seller_id`, así que cada factura nueva entraba sin
 * vendedor enlazado y quedaba fuera de la comisión. Se descubrió con 7 facturas
 * del mismo día ya sueltas — y habrían seguido acumulándose en silencio.
 */

const SORIBEL = "u-soribel";
const HEIDI = "u-heidi";
const DESTENY = "u-desteny";
const LAURA = "u-laura";
const VILLA_OLGA = "b-villa-olga";
const PRINCIPAL = "b-principal";

const porNombre = new Map([
  ["desteny reynoso", DESTENY],
  ["laura mejia", LAURA],
  ["soribel tejada", SORIBEL],
  ["heidi pinales", HEIDI],
]);
const porSucursal = new Map([
  [VILLA_OLGA, SORIBEL],
  [PRINCIPAL, HEIDI],
]);

describe("normalizarNombre", () => {
  it("🔴 «LAURA MEJIA» de Alegra y «Laura Mejía» de DermaLand son la MISMA persona", () => {
    // Sin esto se le partirían las ventas —y la comisión— en dos vendedoras.
    expect(normalizarNombre("LAURA MEJIA")).toBe(normalizarNombre("Laura Mejía"));
  });

  it("aguanta espacios de más y de menos", () => {
    expect(normalizarNombre("  DESTENY   REYNOSO ")).toBe("desteny reynoso");
  });

  it("sin nombre devuelve cadena vacía, no revienta", () => {
    expect(normalizarNombre(null)).toBe("");
    expect(normalizarNombre(undefined)).toBe("");
    expect(normalizarNombre("")).toBe("");
    expect(normalizarNombre("   ")).toBe("");
  });
});

describe("resolverVendedor", () => {
  it("🔴 con vendedor de Alegra, gana el nombre — aunque la sucursal tenga encargada", () => {
    // Desteny vende en Principal, cuya encargada es Heidi. La venta es de
    // Desteny: dársela a Heidi le quitaría a Desteny su comisión.
    expect(resolverVendedor("DESTENY REYNOSO", PRINCIPAL, porNombre, porSucursal)).toBe(DESTENY);
    expect(resolverVendedor("LAURA MEJIA", VILLA_OLGA, porNombre, porSucursal)).toBe(LAURA);
  });

  it("🔴 sin vendedor en Alegra, cae en la encargada de la sucursal", () => {
    expect(resolverVendedor(null, VILLA_OLGA, porNombre, porSucursal)).toBe(SORIBEL);
    expect(resolverVendedor("", PRINCIPAL, porNombre, porSucursal)).toBe(HEIDI);
    expect(resolverVendedor("   ", PRINCIPAL, porNombre, porSucursal)).toBe(HEIDI);
  });

  it("🔴 un vendedor DESCONOCIDO queda suelto, NO se le da a la encargada", () => {
    // Esa venta es de alguien concreto que aún no existe como usuario.
    // Atribuírsela a la encargada de la sucursal sería inventar, y el dinero
    // acabaría en el bolsillo equivocado. Suelta se ve; mal atribuida, no.
    expect(resolverVendedor("VENDEDORA NUEVA", PRINCIPAL, porNombre, porSucursal)).toBeNull();
  });

  it("sin vendedor y sin sucursal, queda suelta", () => {
    expect(resolverVendedor(null, null, porNombre, porSucursal)).toBeNull();
  });

  it("sin vendedor y con sucursal SIN encargada, queda suelta", () => {
    // `default_seller_id` es `on delete set null`: si se da de baja a la
    // encargada, las facturas nuevas quedan visibles en vez de seguir
    // atribuyéndose a alguien que ya no está.
    expect(resolverVendedor(null, "b-sin-encargada", porNombre, porSucursal)).toBeNull();
  });

  it("es determinista: la misma entrada da siempre lo mismo", () => {
    const a = resolverVendedor("Desteny Reynoso", VILLA_OLGA, porNombre, porSucursal);
    const b = resolverVendedor("DESTENY  REYNOSO", VILLA_OLGA, porNombre, porSucursal);
    expect(a).toBe(b);
  });
});
