import { describe, expect, it } from "vitest";
import {
  buildIdempotencyKey,
  IDEMPOTENT_OPERATIONS,
  InvalidIdempotencyInput,
  isSameOperation,
  type IdempotencyInput,
} from "./idempotency";

const BASE: IdempotencyInput = {
  businessId: "d001",
  environment: "ecf",
  encf: "E310000000001",
  operation: "submit",
};

describe("la misma operación da la misma llave", () => {
  it("el doble clic no crea dos envíos", () => {
    expect(buildIdempotencyKey(BASE)).toBe(buildIdempotencyKey({ ...BASE }));
  });

  it("da igual cómo venga escrito el e-NCF", () => {
    const a = buildIdempotencyKey(BASE);
    expect(buildIdempotencyKey({ ...BASE, encf: "  e310000000001  " })).toBe(a);
  });

  it("es legible: quien la mire entiende qué pasó", () => {
    // En claro y no como hash a propósito. Un hash no explica nada a las 2 a.m.
    expect(buildIdempotencyKey(BASE)).toBe("d001:ecf:E310000000001:submit");
  });
});

describe("lo que TIENE que dar llaves distintas", () => {
  it("una prueba no puede bloquear una emisión real", () => {
    // El mismo e-NCF existe en pruebas y en producción. Si compartieran llave,
    // haber probado con ese número impediría emitirlo de verdad.
    const prueba = buildIdempotencyKey({ ...BASE, environment: "testecf" });
    const real = buildIdempotencyKey({ ...BASE, environment: "ecf" });
    const cert = buildIdempotencyKey({ ...BASE, environment: "certecf" });
    expect(new Set([prueba, real, cert]).size).toBe(3);
  });

  it("consultar el estado no choca con el envío que lo creó", () => {
    const enviar = buildIdempotencyKey({ ...BASE, operation: "submit" });
    const consultar = buildIdempotencyKey({ ...BASE, operation: "query" });
    expect(enviar).not.toBe(consultar);
  });

  it("las cuatro operaciones son distintas entre sí", () => {
    const llaves = IDEMPOTENT_OPERATIONS.map((operation) =>
      buildIdempotencyKey({ ...BASE, operation }),
    );
    expect(new Set(llaves).size).toBe(IDEMPOTENT_OPERATIONS.length);
  });

  it("dos negocios con el mismo e-NCF no se pisan", () => {
    const a = buildIdempotencyKey({ ...BASE, businessId: "d001" });
    const b = buildIdempotencyKey({ ...BASE, businessId: "d002" });
    expect(a).not.toBe(b);
  });

  it("un reenvío corregido es otra operación, no un duplicado", () => {
    // Un rechazo que se corrige y se vuelve a enviar tiene el mismo e-NCF. Sin
    // el número de intento, la llave lo confundiría con el envío original y lo
    // bloquearía para siempre.
    const primero = buildIdempotencyKey(BASE);
    const segundo = buildIdempotencyKey({ ...BASE, attempt: 1 });
    expect(segundo).not.toBe(primero);
  });
});

describe("añadir el reintento no invalida lo ya emitido", () => {
  it("sin intento y con intento 0 dan la MISMA llave", () => {
    const sin = buildIdempotencyKey(BASE);
    expect(buildIdempotencyKey({ ...BASE, attempt: 0 })).toBe(sin);
  });
});

describe("una llave a medias es peor que un error", () => {
  it("sin negocio, falla", () => {
    // Una llave incompleta colisiona con otra distinta y bloquea una emisión
    // que debía salir.
    expect(() => buildIdempotencyKey({ ...BASE, businessId: "  " })).toThrow(
      InvalidIdempotencyInput,
    );
  });

  it("sin e-NCF, falla", () => {
    expect(() => buildIdempotencyKey({ ...BASE, encf: "" })).toThrow(
      InvalidIdempotencyInput,
    );
  });

  it("con un ambiente inventado, falla", () => {
    expect(() =>
      buildIdempotencyKey({
        ...BASE,
        environment: "produccion" as never,
      }),
    ).toThrow(InvalidIdempotencyInput);
  });

  it("con una operación inventada, falla", () => {
    expect(() =>
      buildIdempotencyKey({ ...BASE, operation: "borrar" as never }),
    ).toThrow(InvalidIdempotencyInput);
  });
});

describe("isSameOperation", () => {
  it("dice que sí cuando lo es", () => {
    expect(isSameOperation(BASE, { ...BASE, encf: "e310000000001" })).toBe(true);
  });

  it("dice que no cuando cambia el ambiente", () => {
    expect(isSameOperation(BASE, { ...BASE, environment: "testecf" })).toBe(false);
  });
});
