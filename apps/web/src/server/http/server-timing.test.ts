import { describe, expect, it } from "vitest";
import { Cronometro } from "./server-timing";

/**
 * 🔴 Lo que protege: que la cabecera diga la VERDAD y no lleve nada del
 * negocio. Un `Server-Timing` con una etiqueta que venga de fuera sería una
 * inyección de cabecera; uno sin `total` no distingue «tardó la función» de
 * «tardó la red», que es justo lo que había que averiguar.
 */
describe("Cronometro", () => {
  it("siempre lleva el total, aunque no se nombre ninguna etapa", () => {
    expect(new Cronometro().cabecera()).toMatch(/^total;dur=\d/);
  });

  it("nombra cada etapa en orden y con su duración", () => {
    const c = new Cronometro();
    c.fin("sesion");
    c.fin("base");
    const h = c.cabecera();
    expect(h).toMatch(/sesion;dur=\d/);
    expect(h).toMatch(/base;dur=\d/);
    expect(h.indexOf("sesion")).toBeLessThan(h.indexOf("base"));
    expect(h.indexOf("base")).toBeLessThan(h.indexOf("total"));
  });

  it("`medir` cronometra una promesa y devuelve su valor", async () => {
    const c = new Cronometro();
    await expect(c.medir("consulta", Promise.resolve(42))).resolves.toBe(42);
    expect(c.cabecera()).toMatch(/consulta;dur=/);
  });

  it("una promesa que falla se propaga, pero la etapa queda medida", async () => {
    const c = new Cronometro();
    await expect(c.medir("consulta", Promise.reject(new Error("no")))).rejects.toThrow("no");
    expect(c.cabecera()).toMatch(/consulta;dur=/);
  });

  it("🔴 un nombre de etapa con caracteres raros NO rompe la cabecera", () => {
    // Sin la limpieza, un nombre con coma o salto de línea partiría la cabecera
    // en dos —o inyectaría otra— y el navegador leería cualquier cosa.
    const c = new Cronometro();
    c.fin('base";x=1,\notra');
    const h = c.cabecera();
    expect(h).not.toContain("\n");
    expect(h).not.toContain('"');
    expect(h.split(",").length).toBe(2); // la etapa y el total, nada más
  });

  it("las cabeceras conservan las que ya venían", () => {
    const h = new Cronometro().cabeceras({ "Cache-Control": "no-store" });
    expect(h["Cache-Control"]).toBe("no-store");
    expect(h["Server-Timing"]).toMatch(/total;dur=/);
  });
});
