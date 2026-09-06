// apps/web/src/features/dgii/services/certificate-validity.test.ts
//
// Menor (segunda tanda, revisión externa): `certificadoVigente` reemplaza
// dos reglas de vigencia escritas por separado -- `certificates.ts` miraba
// `valid_to` Y `valid_from`; `enablement.ts` solo miraba `valid_to`-- por
// una sola. El caso que antes se escapaba (un certificado con `valid_from`
// en el futuro pasaba el gate de habilitación como "activo") es el segundo
// test de aquí abajo.
import { describe, it, expect } from "vitest";
import { certificadoVigente } from "./certificate-validity";

describe("certificadoVigente: una sola regla para certificates.ts y enablement.ts", () => {
  const ahora = new Date("2026-09-06T12:00:00.000Z");

  it("vigente: valid_from ya pasó y valid_to todavía no llega", () => {
    expect(
      certificadoVigente({ valid_from: "2026-01-01T00:00:00.000Z", valid_to: "2027-01-01T00:00:00.000Z" }, ahora),
    ).toBe(true);
  });

  it("vencido: valid_to ya pasó", () => {
    expect(
      certificadoVigente({ valid_from: "2026-01-01T00:00:00.000Z", valid_to: "2026-09-01T00:00:00.000Z" }, ahora),
    ).toBe(false);
  });

  it("todavía no vigente: valid_from está en el futuro (el caso que enablement.ts no veía)", () => {
    expect(
      certificadoVigente({ valid_from: "2026-12-01T00:00:00.000Z", valid_to: "2027-01-01T00:00:00.000Z" }, ahora),
    ).toBe(false);
  });

  it("sin ninguna fecha registrada, no bloquea: no hay con qué comparar", () => {
    expect(certificadoVigente({ valid_from: null, valid_to: null }, ahora)).toBe(true);
  });

  it("con valid_to en el futuro y valid_from null, vigente", () => {
    expect(certificadoVigente({ valid_from: null, valid_to: "2027-01-01T00:00:00.000Z" }, ahora)).toBe(true);
  });
});
