import { describe, expect, it } from "vitest";
import { pickBillingBranch } from "./billing-branch";

const CUTIS = "cutis";
const PRINCIPAL = "principal";
const SUCURSALES = [CUTIS, PRINCIPAL];

/** `stockFor` de mentira, a partir de un mapa "producto@sucursal". */
function stock(tabla: Record<string, number>) {
  return (productId: string, branchId: string) =>
    tabla[`${productId}@${branchId}`] ?? 0;
}

describe("pickBillingBranch", () => {
  it("el caso real: el pedido es de Cutis y Cutis no tiene NADA", () => {
    // "Cutis" está anunciada en la tienda con cero lotes; todo el inventario
    // vive en Principal. Facturar obedientemente en Cutis daría un carrito
    // vacío y el cajero tendría que teclearlo todo.
    const pick = pickBillingBranch(
      [
        { productId: "aqua-gel", qty: 1 },
        { productId: "gel-200", qty: 1 },
      ],
      CUTIS,
      SUCURSALES,
      stock({ "aqua-gel@principal": 3, "gel-200@principal": 8 }),
    );
    expect(pick.branchId).toBe(PRINCIPAL);
    expect(pick.covered).toBe(2);
    expect(pick.changed).toBe(true);
  });

  it("si la del pedido lo cubre todo, no se mueve", () => {
    const pick = pickBillingBranch(
      [{ productId: "a", qty: 2 }],
      CUTIS,
      SUCURSALES,
      stock({ "a@cutis": 5, "a@principal": 99 }),
    );
    expect(pick.branchId).toBe(CUTIS);
    expect(pick.changed).toBe(false);
  });

  it("empatar no basta para mover la venta de sitio", () => {
    // Si las dos cubren lo mismo, se queda donde el cliente quedó en pasar.
    const pick = pickBillingBranch(
      [
        { productId: "a", qty: 1 },
        { productId: "b", qty: 1 },
      ],
      CUTIS,
      SUCURSALES,
      stock({ "a@cutis": 1, "b@principal": 1 }),
    );
    expect(pick.branchId).toBe(CUTIS);
    expect(pick.covered).toBe(1);
    expect(pick.changed).toBe(false);
  });

  it("se queda con la que cubre MÁS, aunque no cubra todo", () => {
    const pick = pickBillingBranch(
      [
        { productId: "a", qty: 1 },
        { productId: "b", qty: 1 },
        { productId: "c", qty: 1 },
      ],
      CUTIS,
      SUCURSALES,
      stock({
        "a@cutis": 1,
        "a@principal": 1,
        "b@principal": 1,
        "c@principal": 0,
      }),
    );
    expect(pick.branchId).toBe(PRINCIPAL);
    expect(pick.covered).toBe(2);
  });

  it("cubrir una línea es tenerla ENTERA, no un poco", () => {
    const pick = pickBillingBranch(
      [{ productId: "a", qty: 5 }],
      CUTIS,
      SUCURSALES,
      stock({ "a@cutis": 4, "a@principal": 5 }),
    );
    expect(pick.branchId).toBe(PRINCIPAL);
  });

  it("si no hay en ningún lado se queda en la del pedido", () => {
    // Moverse no arregla nada: hay que llamar al cliente igual.
    const pick = pickBillingBranch(
      [{ productId: "a", qty: 1 }],
      CUTIS,
      SUCURSALES,
      stock({}),
    );
    expect(pick.branchId).toBe(CUTIS);
    expect(pick.covered).toBe(0);
    expect(pick.changed).toBe(false);
  });

  it("un pedido sin líneas no mueve nada", () => {
    const pick = pickBillingBranch([], CUTIS, SUCURSALES, stock({}));
    expect(pick.branchId).toBe(CUTIS);
    expect(pick.changed).toBe(false);
  });

  it("con una sola sucursal no hay a dónde ir", () => {
    const pick = pickBillingBranch(
      [{ productId: "a", qty: 1 }],
      CUTIS,
      [CUTIS],
      stock({}),
    );
    expect(pick.branchId).toBe(CUTIS);
  });
});
