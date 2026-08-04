import { describe, expect, it } from "vitest";
import { buildOrderTimeline, customerStatusMessage } from "./timeline";

describe("buildOrderTimeline", () => {
  it("enseña el camino completo con el paso actual marcado", () => {
    const t = buildOrderTimeline("preparando", "pickup");
    expect(t.map((p) => p.key)).toEqual([
      "recibido",
      "confirmado",
      "preparando",
      "listo",
      "entregado",
    ]);
    expect(t.filter((p) => p.done).map((p) => p.key)).toEqual([
      "recibido",
      "confirmado",
      "preparando",
    ]);
    expect(t.find((p) => p.current)?.key).toBe("preparando");
  });

  it("en el primer paso solo ese está hecho", () => {
    const t = buildOrderTimeline("recibido", "pickup");
    expect(t.filter((p) => p.done)).toHaveLength(1);
    expect(t[0]?.current).toBe(true);
  });

  it("al entregar, todo hecho y nada pendiente", () => {
    const t = buildOrderTimeline("entregado", "pickup");
    expect(t.every((p) => p.done)).toBe(true);
    expect(t.find((p) => p.current)?.key).toBe("entregado");
  });

  it("cancelado NO pinta la línea: no hay camino que enseñar", () => {
    // Una línea de progreso con un pedido cancelado sugiere que sigue vivo.
    expect(buildOrderTimeline("cancelado", "pickup")).toEqual([]);
  });

  it("los textos cambian entre retiro y envío", () => {
    const retiro = buildOrderTimeline("listo", "pickup");
    const envio = buildOrderTimeline("listo", "delivery");
    expect(retiro.find((p) => p.key === "listo")?.label).toMatch(/retirar/i);
    expect(envio.find((p) => p.key === "listo")?.label).toMatch(/camino|reparto/i);
    expect(retiro.find((p) => p.key === "entregado")?.label).toMatch(/retirad/i);
    expect(envio.find((p) => p.key === "entregado")?.label).toMatch(/entregad/i);
  });

  it("ningún texto es la clave cruda", () => {
    for (const modo of ["pickup", "delivery"] as const) {
      for (const p of buildOrderTimeline("recibido", modo)) {
        expect(p.label).not.toBe(p.key);
        expect(p.label.length).toBeGreaterThan(3);
      }
    }
  });
});

describe("customerStatusMessage", () => {
  const PEDIDO = { number: "WEB-000123", url: "https://x.do/tienda/pedido/abc" };

  it("cada estado tiene su aviso, y menciona el número del pedido", () => {
    for (const s of ["confirmado", "preparando", "listo", "entregado", "cancelado"] as const) {
      const m = customerStatusMessage(s, "pickup", PEDIDO);
      expect(m).not.toBeNull();
      expect(m!.subject).toContain("WEB-000123");
      expect(m!.text).toContain(PEDIDO.url);
    }
  });

  it("NO avisa al recibir: el cliente acaba de hacerlo, ya lo sabe", () => {
    expect(customerStatusMessage("recibido", "pickup", PEDIDO)).toBeNull();
  });

  it("el aviso de listo distingue retiro de envío", () => {
    const retiro = customerStatusMessage("listo", "pickup", PEDIDO)!;
    const envio = customerStatusMessage("listo", "delivery", PEDIDO)!;
    expect(retiro.text).toMatch(/retirar|recoger/i);
    expect(envio.text).toMatch(/camino|reparto|entrega/i);
    expect(retiro.text).not.toBe(envio.text);
  });

  it("el de cancelado no promete nada ni culpa al cliente", () => {
    const m = customerStatusMessage("cancelado", "pickup", PEDIDO)!;
    expect(m.text).not.toMatch(/prepara|camino|listo/i);
  });

  it("nunca deja una plantilla sin rellenar", () => {
    for (const s of ["confirmado", "preparando", "listo", "entregado", "cancelado"] as const) {
      const m = customerStatusMessage(s, "delivery", PEDIDO)!;
      expect(m.text).not.toContain("{");
      expect(m.subject).not.toContain("{");
    }
  });
});
