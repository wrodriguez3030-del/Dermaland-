import { describe, expect, it } from "vitest";
import { isPublic } from "./middleware";

/**
 * La lista de rutas públicas es la frontera entre lo que ve cualquiera en
 * internet y lo que exige sesión y 2FA. Un error aquí no falla ruidosamente:
 * abre una puerta en silencio. Por eso se comprueba en los DOS sentidos.
 */
describe("isPublic", () => {
  it.each([
    "/login",
    "/recuperar",
    "/restablecer",
    "/auth/callback",
    "/api/health",
    "/api/whatsapp/webhook",
    // Comprobante público por token firmado.
    "/factura/abc123",
    "/api/proformas/9f0c2f5e-1111-2222-3333-444455556666/pdf",
    // Logo para correos: ruta EXACTA (DL-07).
    "/api/brand/logo",
    // Tienda en línea.
    "/tienda",
    "/tienda/producto/avene-cicalfate-crema",
    // Sin estas dos, el rastreador recibía un 307 a /login y —sin reglas que
    // leer— asumía que podía rastrear todo, incluidos los Preview.
    "/robots.txt",
    "/sitemap.xml",
  ])("deja pasar %s", (ruta) => {
    expect(isPublic(ruta)).toBe(true);
  });

  it.each([
    "/",
    "/productos",
    "/ventas",
    "/tienda-web", // la ADMINISTRACIÓN de la tienda no es la tienda
    "/super-admin",
    "/super-admin/negocios",
    "/api/products",
    "/api/customers",
    "/api/storefront/settings",
    "/api/storefront/products/9f0c2f5e-1111-2222-3333-444455556666",
    // DL-07: el CRUD de marcas NO puede colarse por el prefijo del logo.
    "/api/brands",
    // Ni un nombre que empiece igual que una ruta pública.
    "/factura-falsa",
    "/tiendas",
    "/tienda-web/productos",
    // El PDF público exige el patrón completo.
    "/api/proformas/9f0c2f5e/pdf/extra",
    "/api/proformas",
  ])("exige sesión en %s", (ruta) => {
    expect(isPublic(ruta)).toBe(false);
  });
});
