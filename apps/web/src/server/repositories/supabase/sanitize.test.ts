import { describe, expect, it } from "vitest";
import {
  isUuid,
  mapPaymentMethod,
  nullableUuid,
  requireUuid,
  toDbDate,
  toDbInt,
  toDbMoney,
  toDbMoneyNullable,
  toDbTimestamp,
} from "./sanitize";
import { UserFacingRepositoryError } from "./client";

const UUID = "3f1a2b3c-4d5e-6f70-8a9b-0c1d2e3f4a5b";

describe("isUuid / nullableUuid", () => {
  it("acepta UUID válido", () => {
    expect(isUuid(UUID)).toBe(true);
    expect(nullableUuid(UUID)).toBe(UUID);
  });

  it("convierte vacío / walk-in / no-UUID a null", () => {
    expect(nullableUuid("")).toBeNull();
    expect(nullableUuid("walk-in")).toBeNull();
    expect(nullableUuid("Consumidor Final")).toBeNull();
    expect(nullableUuid(undefined)).toBeNull();
    expect(nullableUuid("usr_cashier_1")).toBeNull();
    expect(nullableUuid("cust_123")).toBeNull();
  });
});

describe("requireUuid", () => {
  it("devuelve el UUID si es válido", () => {
    expect(requireUuid(UUID, "Sucursal")).toBe(UUID);
  });
  it("lanza error amigable si no es UUID", () => {
    expect(() => requireUuid("br_santiago", "Sucursal")).toThrow(
      UserFacingRepositoryError,
    );
    try {
      requireUuid("", "Sucursal");
    } catch (e) {
      expect((e as Error).message).toMatch(/Sucursal/);
      expect((e as Error).message).not.toMatch(/uuid|supabase|syntax/i);
    }
  });
});

describe("toDbMoney", () => {
  it("convierte 'RD$2,600.00' a 2600", () => {
    expect(toDbMoney("RD$2,600.00")).toBe(2600);
  });
  it("acepta number directo", () => {
    expect(toDbMoney(1234.5)).toBe(1234.5);
  });
  it("quita comas de miles y espacios", () => {
    expect(toDbMoney(" 1,250,000.75 ")).toBe(1250000.75);
  });
  it("null → 0", () => {
    expect(toDbMoney(null)).toBe(0);
  });
  it("NaN / vacío / Infinity lanzan error amigable", () => {
    expect(() => toDbMoney("abc")).toThrow(UserFacingRepositoryError);
    expect(() => toDbMoney("")).toThrow(UserFacingRepositoryError);
    expect(() => toDbMoney(Infinity)).toThrow(UserFacingRepositoryError);
    expect(() => toDbMoney(NaN)).toThrow(UserFacingRepositoryError);
  });
  it("toDbMoneyNullable: vacío/null → null", () => {
    expect(toDbMoneyNullable("")).toBeNull();
    expect(toDbMoneyNullable(null)).toBeNull();
    expect(toDbMoneyNullable("RD$100")).toBe(100);
  });
});

describe("toDbInt", () => {
  it("trunca a entero", () => {
    expect(toDbInt("3")).toBe(3);
    expect(toDbInt(4.9)).toBe(4);
  });
  it("inválido lanza error", () => {
    expect(() => toDbInt("x")).toThrow(UserFacingRepositoryError);
  });
});

describe("toDbDate", () => {
  it("passthrough ISO", () => {
    expect(toDbDate("2027-06-20")).toBe("2027-06-20");
  });
  it("convierte DD/MM/YYYY dominicano a ISO", () => {
    expect(toDbDate("20/06/2027")).toBe("2027-06-20");
    expect(toDbDate("5-3-2026")).toBe("2026-03-05");
  });
  it("Date → ISO date", () => {
    expect(toDbDate(new Date("2026-01-15T10:00:00Z"))).toBe("2026-01-15");
  });
  it("inválida lanza error", () => {
    expect(() => toDbDate("no-fecha")).toThrow(UserFacingRepositoryError);
  });
});

describe("toDbTimestamp", () => {
  it("ISO válido", () => {
    expect(toDbTimestamp("2026-06-26T14:00:00Z")).toBe(
      new Date("2026-06-26T14:00:00Z").toISOString(),
    );
  });
  it("inválido lanza error", () => {
    expect(() => toDbTimestamp("xxx")).toThrow(UserFacingRepositoryError);
  });
});

describe("mapPaymentMethod", () => {
  it("mapea español al enum", () => {
    expect(mapPaymentMethod("efectivo")).toBe("cash");
    expect(mapPaymentMethod("tarjeta")).toBe("card");
    expect(mapPaymentMethod("transferencia")).toBe("transfer");
    expect(mapPaymentMethod("otro")).toBe("other");
  });
  it("pasa valores ya válidos", () => {
    expect(mapPaymentMethod("cash")).toBe("cash");
    expect(mapPaymentMethod("azul")).toBe("azul");
  });
  it("desconocido → other (no rompe el check)", () => {
    expect(mapPaymentMethod("bitcoin")).toBe("other");
    expect(mapPaymentMethod("")).toBe("other");
  });
});
