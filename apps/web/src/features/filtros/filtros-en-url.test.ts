import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EMPTY_FILTERS } from "@/features/sales/sales-report";
import { codecFiltrosComision, codecFiltrosVentas } from "./filtros-en-url";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 14, 10, 0, 0)); // 14/09/2026, hoy de esta sesión
});
afterEach(() => vi.useRealTimers());

describe("codecFiltrosVentas — rangoPorDefecto: 'today' (/ventas)", () => {
  const codec = codecFiltrosVentas({ rangoPorDefecto: "today" });

  it("leer(): una URL sin nada relevante devuelve null (manda el por-defecto del llamador)", () => {
    expect(codec.leer(new URLSearchParams(""))).toBeNull();
  });

  it("escribir(): el rango de HOY (recién calculado) no ensucia la URL", () => {
    const hoy = { ...EMPTY_FILTERS, from: "2026-09-14", to: "2026-09-14" };
    expect(codec.escribir(hoy).toString()).toBe("");
  });

  it("escribir(): «Todo» (vacío) SÍ se distingue del arranque limpio — periodo=todo", () => {
    const qs = codec.escribir(EMPTY_FILTERS).toString();
    expect(qs).toBe("periodo=todo");
  });

  it("leer(): periodo=todo vuelve a dar el rango vacío", () => {
    const f = codec.leer(new URLSearchParams("periodo=todo"));
    expect(f).not.toBeNull();
    expect(f!.from).toBe("");
    expect(f!.to).toBe("");
  });

  it("alias heredado period=all == periodo=todo", () => {
    const f = codec.leer(new URLSearchParams("period=all"));
    expect(f!.from).toBe("");
    expect(f!.to).toBe("");
  });

  it("un rango personalizado viaja en desde/hasta, tal cual", () => {
    const f = { ...EMPTY_FILTERS, from: "2026-01-01", to: "2026-01-31" };
    const qs = codec.escribir(f).toString();
    expect(qs).toContain("desde=2026-01-01");
    expect(qs).toContain("hasta=2026-01-31");
    expect(codec.leer(new URLSearchParams(qs))).toMatchObject({ from: "2026-01-01", to: "2026-01-31" });
  });

  it("alias heredados from/to (sin periodo) también se leen", () => {
    const f = codec.leer(new URLSearchParams("from=2026-02-01&to=2026-02-28"));
    expect(f).toMatchObject({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("sucursales=a,b ↔ branchIds", () => {
    const f = { ...EMPTY_FILTERS, branchIds: ["b", "a"] };
    const qs = codec.escribir(f).toString();
    expect(qs).toContain("sucursales=a%2Cb"); // ordenadas
    const leido = codec.leer(new URLSearchParams(qs));
    expect(leido!.branchIds).toEqual(["a", "b"]);
  });

  it("una sola sucursal también viaja en sucursales= (no hay sucursalId en la URL)", () => {
    const qs = codec.escribir({ ...EMPTY_FILTERS, branchIds: ["a"] }).toString();
    expect(qs).toContain("sucursales=a");
  });

  it("un valor de enum inválido en la URL se ignora, no revienta", () => {
    const f = codec.leer(new URLSearchParams("metodo=bitcoin"));
    expect(f!.method).toBe("");
  });

  it("un valor de enum válido sí se lee", () => {
    const f = codec.leer(new URLSearchParams("metodo=cash"));
    expect(f!.method).toBe("cash");
  });

  it("vendedor= y el alias seller= dan lo mismo", () => {
    expect(codec.leer(new URLSearchParams("vendedor=v1"))!.sellerId).toBe("v1");
    expect(codec.leer(new URLSearchParams("seller=v1"))!.sellerId).toBe("v1");
  });

  it("proformas=0 excluye proformas; su ausencia las incluye (default true)", () => {
    expect(codec.leer(new URLSearchParams("proformas=0"))!.includeProformas).toBe(false);
    expect(codec.leer(new URLSearchParams("cliente=x"))!.includeProformas).toBe(true);
    expect(codec.escribir({ ...EMPTY_FILTERS, includeProformas: false }).toString()).toContain(
      "proformas=0",
    );
  });

  it("round-trip: escribir → leer devuelve el mismo objeto para un filtro completo", () => {
    const f = {
      ...EMPTY_FILTERS,
      from: "2026-03-01",
      to: "2026-03-31",
      branchIds: ["a", "b"],
      method: "card" as const,
      comprobante: "b02" as const,
      status: "paid" as const,
      cashierId: "cj-1",
      sellerId: "v-1",
      customerQuery: "Juan",
      productQuery: "SKU-1",
      includeProformas: false,
    };
    const qs = codec.escribir(f).toString();
    expect(codec.leer(new URLSearchParams(qs))).toEqual(f);
  });
});

describe("codecFiltrosVentas — rangoPorDefecto: 'all' (/reportes/ventas)", () => {
  const codec = codecFiltrosVentas({ rangoPorDefecto: "all" });

  it("EMPTY_FILTERS (todo el histórico) no escribe periodo=todo — ya es el por-defecto", () => {
    expect(codec.escribir(EMPTY_FILTERS).toString()).toBe("");
  });

  it("«hoy» sí viaja explícito (no hay atajo de arranque que lo confunda)", () => {
    const qs = codec.escribir({ ...EMPTY_FILTERS, from: "2026-09-14", to: "2026-09-14" }).toString();
    expect(qs).toContain("desde=2026-09-14");
  });
});

describe("codecFiltrosComision", () => {
  const codec = codecFiltrosComision();

  it("hereda los alias de la base: ?seller=&from=&to=", () => {
    const f = codec.leer(new URLSearchParams("seller=v1&from=2026-01-01&to=2026-01-31"));
    expect(f).toMatchObject({ sellerId: "v1", from: "2026-01-01", to: "2026-01-31" });
  });

  it("campos propios: comision, regla, numero", () => {
    const qs = new URLSearchParams("comision=excluded&regla=r-1&numero=B0200012923");
    const f = codec.leer(qs);
    expect(f).toMatchObject({
      commissionStatus: "excluded",
      ruleId: "r-1",
      comprobanteQuery: "B0200012923",
    });
  });

  it("sin nada relevante (ni base ni propios) → null", () => {
    expect(codec.leer(new URLSearchParams("x=1"))).toBeNull();
  });

  it("solo con un campo propio (sin base) también activa la lectura", () => {
    expect(codec.leer(new URLSearchParams("regla=r-1"))).not.toBeNull();
  });
});
