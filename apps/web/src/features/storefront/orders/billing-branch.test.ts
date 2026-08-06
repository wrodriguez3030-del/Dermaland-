import { describe, expect, it } from "vitest";
import { missingForBilling } from "./billing-branch";

const PRINCIPAL = "b-principal";
const CUTIS = "b-cutis";

/** Existencias de mentira, indexadas `producto@sucursal`. */
function stockDe(mapa: Record<string, number>) {
  return (productId: string, branchId: string) =>
    mapa[`${productId}@${branchId}`] ?? 0;
}

describe("missingForBilling", () => {
  it("no reporta nada cuando la Principal cubre todo", () => {
    const falta = missingForBilling(
      [{ productId: "p1", qty: 2 }],
      PRINCIPAL,
      [CUTIS],
      stockDe({ "p1@b-principal": 5, "p1@b-cutis": 99 }),
    );
    expect(falta).toEqual([]);
  });

  it("dice cuánto falta y de qué sucursal puede salir", () => {
    // El caso que motivó la política: el cliente pidió 3, la Principal tiene 1
    // y Cutis tiene 10. Hay que transferir 2, no facturar desde Cutis.
    const falta = missingForBilling(
      [{ productId: "p1", qty: 3 }],
      PRINCIPAL,
      [CUTIS],
      stockDe({ "p1@b-principal": 1, "p1@b-cutis": 10 }),
    );
    expect(falta).toHaveLength(1);
    expect(falta[0]).toMatchObject({
      productId: "p1",
      needed: 3,
      available: 1,
      missing: 2,
    });
    expect(falta[0]?.sources).toEqual([{ branchId: CUTIS, available: 10 }]);
  });

  it("con la Principal en cero, sigue siendo la sucursal de facturación", () => {
    // Antes esto mudaba la venta a Cutis. Ahora se queda y pide transferencia:
    // la mercancía se mueve, no la factura.
    const falta = missingForBilling(
      [{ productId: "p1", qty: 1 }],
      PRINCIPAL,
      [CUTIS],
      stockDe({ "p1@b-cutis": 4 }),
    );
    expect(falta[0]?.available).toBe(0);
    expect(falta[0]?.missing).toBe(1);
    expect(falta[0]?.sources[0]?.branchId).toBe(CUTIS);
  });

  it("sin existencia en ninguna sucursal, no propone origen", () => {
    // Distinguir "hay que transferir" de "no hay en ningún lado" importa: la
    // segunda no se arregla con una transferencia, se arregla comprando.
    const falta = missingForBilling(
      [{ productId: "p1", qty: 1 }],
      PRINCIPAL,
      [CUTIS],
      stockDe({}),
    );
    expect(falta[0]?.sources).toEqual([]);
  });

  it("ordena los orígenes de más a menos existencia", () => {
    const TERCERA = "b-tercera";
    const falta = missingForBilling(
      [{ productId: "p1", qty: 10 }],
      PRINCIPAL,
      [CUTIS, TERCERA],
      stockDe({ "p1@b-cutis": 2, "p1@b-tercera": 7 }),
    );
    expect(falta[0]?.sources.map((s) => s.branchId)).toEqual([TERCERA, CUTIS]);
  });

  it("nunca propone la propia sucursal de facturación como origen", () => {
    const falta = missingForBilling(
      [{ productId: "p1", qty: 5 }],
      PRINCIPAL,
      [PRINCIPAL, CUTIS],
      stockDe({ "p1@b-principal": 1, "p1@b-cutis": 9 }),
    );
    expect(falta[0]?.sources.map((s) => s.branchId)).toEqual([CUTIS]);
  });

  it("un pedido sin líneas no falta de nada", () => {
    expect(missingForBilling([], PRINCIPAL, [CUTIS], stockDe({}))).toEqual([]);
  });
});
