import { describe, expect, it } from "vitest";
import {
  canInvoiceWebOrder,
  canTransition,
  isFinalStatus,
  nextStatuses,
  WEB_ORDER_STATUSES,
  webOrderStatusLabel,
  webOrderStatusLabelFor,
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

describe("webOrderStatusLabelFor", () => {
  it("a quien pidió a domicilio no se le dice que vaya a retirar", () => {
    // El cliente que lee "Listo para retirar" en un pedido con envío llama
    // preguntando si tiene que ir a buscarlo.
    expect(webOrderStatusLabelFor("listo", "delivery")).toBe("En camino");
    expect(webOrderStatusLabelFor("listo", "pickup")).toBe("Listo para retirar");
  });

  it("entregado se cuenta según cómo llegó", () => {
    expect(webOrderStatusLabelFor("entregado", "delivery")).toBe("Entregado");
    expect(webOrderStatusLabelFor("entregado", "pickup")).toBe("Entregado");
  });

  it("los estados que no dependen de la entrega dicen lo mismo en los dos", () => {
    for (const s of ["recibido", "confirmado", "preparando", "cancelado"] as const) {
      expect(webOrderStatusLabelFor(s, "delivery")).toBe(
        webOrderStatusLabelFor(s, "pickup"),
      );
    }
  });

  it("ningún estado se queda sin etiqueta en ninguno de los dos modos", () => {
    for (const s of WEB_ORDER_STATUSES) {
      for (const f of ["pickup", "delivery"] as const) {
        const etiqueta = webOrderStatusLabelFor(s, f);
        expect(etiqueta.length).toBeGreaterThan(0);
        expect(etiqueta).not.toBe(s);
      }
    }
  });
});

describe("canInvoiceWebOrder", () => {
  it("NO deja facturar un pedido recién recibido", () => {
    // Es la regla que pidió el dueño: hasta que alguien no lo confirme a mano,
    // no se emite documento fiscal sobre algo que nadie ha revisado.
    expect(canInvoiceWebOrder("recibido")).toBe(false);
  });

  it("no deja facturar un pedido cancelado", () => {
    // No se emite un documento por una venta que no ocurrió.
    expect(canInvoiceWebOrder("cancelado")).toBe(false);
  });

  it("deja facturar desde confirmado en adelante", () => {
    for (const s of ["confirmado", "preparando", "listo"] as const) {
      expect(canInvoiceWebOrder(s)).toBe(true);
    }
  });

  it("deja facturar un pedido YA ENTREGADO", () => {
    // No es un descuido: la mercancía salió y falta el documento. Ese es
    // justamente el caso que hay que poder arreglar, no uno que bloquear.
    expect(canInvoiceWebOrder("entregado")).toBe(true);
  });

  it("cubre todos los estados que existen", () => {
    // Si mañana se añade un estado, esta prueba obliga a decidir si factura o
    // no, en vez de dejarlo caer en el `false` por descuido.
    for (const s of WEB_ORDER_STATUSES) {
      expect(typeof canInvoiceWebOrder(s)).toBe("boolean");
    }
    expect(WEB_ORDER_STATUSES.filter(canInvoiceWebOrder)).toHaveLength(4);
  });
});
