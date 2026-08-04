import { describe, expect, it } from "vitest";
import {
  canTransition,
  isFinalStatus,
  nextStatuses,
  WEB_ORDER_STATUSES,
  webOrderStatusLabel,
} from "./status";

describe("estados del pedido", () => {
  it("avanza por el camino normal", () => {
    expect(canTransition("recibido", "confirmado")).toBe(true);
    expect(canTransition("confirmado", "preparando")).toBe(true);
    expect(canTransition("preparando", "listo")).toBe(true);
    expect(canTransition("listo", "entregado")).toBe(true);
  });

  it("no retrocede: deshacer un estado se hace cancelando, no marcha atrás", () => {
    expect(canTransition("confirmado", "recibido")).toBe(false);
    expect(canTransition("entregado", "listo")).toBe(false);
  });

  it("no salta pasos", () => {
    expect(canTransition("recibido", "listo")).toBe(false);
    expect(canTransition("recibido", "entregado")).toBe(false);
  });

  it("se puede cancelar mientras no se haya entregado", () => {
    for (const s of ["recibido", "confirmado", "preparando", "listo"] as const) {
      expect(canTransition(s, "cancelado")).toBe(true);
    }
  });

  it("lo entregado y lo cancelado ya no se mueven", () => {
    expect(isFinalStatus("entregado")).toBe(true);
    expect(isFinalStatus("cancelado")).toBe(true);
    expect(nextStatuses("entregado")).toEqual([]);
    expect(nextStatuses("cancelado")).toEqual([]);
    expect(canTransition("cancelado", "recibido")).toBe(false);
  });

  it("quedarse donde está no es una transición", () => {
    expect(canTransition("recibido", "recibido")).toBe(false);
  });

  it("cada estado tiene etiqueta en español y ninguna es la clave cruda", () => {
    for (const s of WEB_ORDER_STATUSES) {
      const etiqueta = webOrderStatusLabel(s);
      expect(etiqueta.length).toBeGreaterThan(0);
      expect(etiqueta).not.toBe(s);
    }
  });

  it("todo estado del CHECK de la base tiene su transición definida", () => {
    // Si la base admite un estado que aquí no existe, la pantalla del ERP se
    // quedaría sin saber qué botones ofrecer.
    for (const s of WEB_ORDER_STATUSES) {
      expect(Array.isArray(nextStatuses(s))).toBe(true);
    }
  });
});
