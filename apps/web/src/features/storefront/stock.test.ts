import { describe, expect, it } from "vitest";
import {
  checkOrderStock,
  sellableByProduct,
  stockProblemMessage,
  webAvailability,
  type WebAvailability,
  type WebStockLot,
} from "./stock";

const HOY = "2026-08-04";

function lote(p: Partial<WebStockLot> = {}): WebStockLot {
  return {
    productId: "prod-1",
    branchId: "cutis",
    status: "available",
    currentQuantity: 10,
    expiresAt: "2027-01-01",
    ...p,
  };
}

describe("sellableByProduct", () => {
  it("suma los lotes vendibles y los reparte por sucursal", () => {
    const r = sellableByProduct(
      [
        lote({ currentQuantity: 4, branchId: "cutis" }),
        lote({ currentQuantity: 6, branchId: "cutis" }),
        lote({ currentQuantity: 3, branchId: "santiago" }),
      ],
      HOY,
    );
    expect(r.get("prod-1")?.total).toBe(13);
    expect(r.get("prod-1")?.byBranch.get("cutis")).toBe(10);
    expect(r.get("prod-1")?.byBranch.get("santiago")).toBe(3);
  });

  it("no cuenta lo vencido, lo apartado ni lo que está en cero", () => {
    const r = sellableByProduct(
      [
        lote({ expiresAt: "2026-08-03" }), // venció ayer
        lote({ status: "quarantine" }),
        lote({ currentQuantity: 0 }),
        lote({ expiresAt: null }), // sin fecha no se puede afirmar que sirva
      ],
      HOY,
    );
    expect(r.get("prod-1")).toBeUndefined();
  });

  it("un lote que vence HOY todavía se vende", () => {
    const r = sellableByProduct([lote({ expiresAt: HOY })], HOY);
    expect(r.get("prod-1")?.total).toBe(10);
  });
});

describe("webAvailability", () => {
  it("resta lo ya prometido a otros pedidos", () => {
    const stock = sellableByProduct([lote({ currentQuantity: 10 })], HOY).get(
      "prod-1",
    );
    expect(webAvailability(stock, 3).available).toBe(7);
  });

  it("nunca dice que quedan menos de cero", () => {
    // Puede pasar: alguien sacó mercancía por otro camino. Lo honesto es
    // decir "no queda", no "quedan menos tres".
    const stock = sellableByProduct([lote({ currentQuantity: 2 })], HOY).get(
      "prod-1",
    );
    const d = webAvailability(stock, 5);
    expect(d.available).toBe(0);
    expect(d.physical).toBe(2);
    expect(d.committed).toBe(5);
  });

  it("un producto sin lotes está en cero, no revienta", () => {
    expect(webAvailability(undefined, 0).available).toBe(0);
  });
});

function disponible(n: number): WebAvailability {
  return { physical: n, committed: 0, available: n, byBranch: new Map() };
}

describe("checkOrderStock", () => {
  it("deja pasar lo que alcanza, incluido justo lo último", () => {
    const problemas = checkOrderStock(
      [{ productId: "a", productName: "Cicalfate", qty: 3 }],
      new Map([["a", disponible(3)]]),
    );
    expect(problemas).toEqual([]);
  });

  it("el fallo que existía: pedir 50 de algo que tiene 1", () => {
    const problemas = checkOrderStock(
      [{ productId: "a", productName: "Cicalfate", qty: 50 }],
      new Map([["a", disponible(1)]]),
    );
    expect(problemas).toEqual([
      { productName: "Cicalfate", requested: 50, available: 1 },
    ]);
  });

  it("un producto que no está en el mapa cuenta como agotado", () => {
    // Si no se pudo leer su existencia, vender a ciegas es lo peor que se
    // puede hacer: se para.
    const problemas = checkOrderStock(
      [{ productId: "fantasma", productName: "X", qty: 1 }],
      new Map(),
    );
    expect(problemas).toHaveLength(1);
    expect(problemas[0]!.available).toBe(0);
  });

  it("devuelve TODAS las líneas que fallan, no solo la primera", () => {
    const problemas = checkOrderStock(
      [
        { productId: "a", productName: "Cicalfate", qty: 5 },
        { productId: "b", productName: "Sebium", qty: 1 },
        { productId: "c", productName: "Effaclar", qty: 9 },
      ],
      new Map([
        ["a", disponible(1)],
        ["b", disponible(4)],
        ["c", disponible(0)],
      ]),
    );
    expect(problemas.map((p) => p.productName)).toEqual([
      "Cicalfate",
      "Effaclar",
    ]);
  });
});

describe("stockProblemMessage", () => {
  it("dice el nombre y el número, no 'no hay stock'", () => {
    expect(
      stockProblemMessage([
        { productName: "Cicalfate", requested: 5, available: 2 },
      ]),
    ).toBe(
      "Solo nos quedan 2 de Cicalfate y pediste 5. Ajusta la cantidad.",
    );
  });

  it("concuerda el singular", () => {
    expect(
      stockProblemMessage([
        { productName: "Cicalfate", requested: 3, available: 1 },
      ]),
    ).toContain("Solo nos queda 1 de Cicalfate");
  });

  it("cuando no queda ninguno, dice que se acabó", () => {
    expect(
      stockProblemMessage([
        { productName: "Cicalfate", requested: 1, available: 0 },
      ]),
    ).toBe("Se nos acabó Cicalfate. Quítalo del carrito para seguir.");
  });

  it("avisa de que hay más líneas con problema", () => {
    expect(
      stockProblemMessage([
        { productName: "Cicalfate", requested: 5, available: 2 },
        { productName: "Sebium", requested: 2, available: 0 },
      ]),
    ).toContain("(y 1 más en el carrito)");
  });

  it("sin problemas no hay mensaje", () => {
    expect(stockProblemMessage([])).toBe("");
  });
});
