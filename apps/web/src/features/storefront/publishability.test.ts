import { describe, expect, it } from "vitest";
import {
  isPublishable,
  publishBlockers,
  type PublishCandidate,
} from "./publishability";

function candidato(over: Partial<PublishCandidate> = {}): PublishCandidate {
  return {
    active: true,
    sellable: true,
    deletedAt: null,
    price: 1250,
    requiresPrescription: false,
    controlled: false,
    hasValidImage: true,
    ...over,
  };
}

describe("publishBlockers", () => {
  it("un producto completo no tiene motivos", () => {
    expect(publishBlockers(candidato())).toEqual([]);
    expect(isPublishable(candidato())).toBe(true);
  });

  it.each([
    ["deletedAt", { deletedAt: "2026-01-01" }, "Está eliminado del catálogo"],
    ["active", { active: false }, "Está inactivo"],
    ["sellable", { sellable: false }, "No está marcado como vendible"],
    ["price 0", { price: 0 }, "No tiene precio"],
    ["price null", { price: null }, "No tiene precio"],
    ["receta", { requiresPrescription: true }, "Requiere receta médica"],
    ["controlado", { controlled: true }, "Es un producto controlado"],
    ["sin foto", { hasValidImage: false }, "No tiene foto propia"],
  ])("bloquea por %s", (_caso, parche, motivo) => {
    const motivos = publishBlockers(candidato(parche as Partial<PublishCandidate>));
    expect(motivos).toContain(motivo);
    expect(isPublishable(candidato(parche as Partial<PublishCandidate>))).toBe(false);
  });

  it("devuelve TODOS los motivos, no solo el primero", () => {
    // Decirlos de uno en uno obliga al administrador a dar varias vueltas.
    const motivos = publishBlockers(
      candidato({ price: 0, hasValidImage: false, active: false }),
    );
    expect(motivos).toHaveLength(3);
  });

  it("un precio negativo cuenta como sin precio", () => {
    expect(publishBlockers(candidato({ price: -5 }))).toContain("No tiene precio");
  });
});
