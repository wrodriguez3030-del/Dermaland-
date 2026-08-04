import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("deja pasar rutas internas", () => {
    expect(safeNext("/ventas")).toBe("/ventas");
    expect(safeNext("/pedidos-web?estado=recibido")).toBe(
      "/pedidos-web?estado=recibido",
    );
  });

  it("BLOQUEA la doble barra: es una URL a otro dominio", () => {
    // `//evil.com` empieza por "/" y el navegador la resuelve como
    // protocol-relative a evil.com. Es el fallo que tenía /login/mfa: como esa
    // página redirige AL MONTAR cuando no hay factor TOTP, bastaba con mandarle
    // el enlace a alguien —sin sesión y sin un clic— para sacarlo del dominio.
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("//evil.com/phishing")).toBe("/");
  });

  it("BLOQUEA la barra invertida: el navegador la normaliza a //", () => {
    expect(safeNext("/\\evil.com")).toBe("/");
    expect(safeNext("/\\\\evil.com")).toBe("/");
  });

  it("bloquea cualquier cosa con esquema", () => {
    for (const v of [
      "https://evil.com",
      "http://evil.com",
      "javascript:alert(1)",
      "data:text/html,x",
      "//evil.com",
    ]) {
      expect(safeNext(v)).toBe("/");
    }
  });

  it("bloquea lo que no es texto o no empieza por barra", () => {
    for (const v of ["", "ventas", null, undefined, 42, {}, []]) {
      expect(safeNext(v)).toBe("/");
    }
  });

  it("acepta un destino alternativo cuando el valor no sirve", () => {
    // La tienda manda al cliente a /tienda, no al panel del ERP.
    expect(safeNext("//evil.com", "/tienda")).toBe("/tienda");
    expect(safeNext("/tienda/carrito", "/tienda")).toBe("/tienda/carrito");
  });
});
