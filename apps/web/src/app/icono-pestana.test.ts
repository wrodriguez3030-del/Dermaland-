import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 🔴 El icono de la pestaña existe y el manifiesto NO apunta a archivos que no
 * están.
 *
 * Antes: la pestaña enseñaba el globo genérico del navegador (no había ningún
 * icono), y `manifest.webmanifest` declaraba `/brand/icon-192.png` y
 * `/brand/icon-512.png`, que NO EXISTÍAN — instalar la aplicación en un
 * teléfono dejaba un icono roto, y nada avisaba: un manifiesto con rutas
 * muertas no rompe el build ni da error en pantalla.
 */
const raiz = process.cwd();
const publico = (ruta: string) => resolve(raiz, "public", ruta.replace(/^\//, ""));

describe("icono de la aplicación", () => {
  it("🔴 hay un icono para la pestaña", () => {
    // Convención de Next: `src/app/icon.svg` se sirve como favicon.
    expect(existsSync(resolve(raiz, "src/app/icon.svg"))).toBe(true);
  });

  it("🔴 el icono lleva fondo: la «D» calada sería un agujero en la pestaña", () => {
    const svg = readFileSync(resolve(raiz, "src/app/icon.svg"), "utf8");
    expect(svg).toMatch(/<rect[^>]*fill="#[0-9A-Fa-f]{3,8}"/);
  });

  it("🔴 TODOS los iconos del manifiesto existen de verdad", () => {
    const manifiesto = JSON.parse(
      readFileSync(publico("manifest.webmanifest"), "utf8"),
    ) as { icons?: { src: string }[] };
    const iconos = manifiesto.icons ?? [];
    expect(iconos.length, "el manifiesto se quedó sin iconos").toBeGreaterThan(0);
    const rotos = iconos.map((i) => i.src).filter((src) => !existsSync(publico(src)));
    expect(rotos, `el manifiesto apunta a archivos que no existen: ${rotos.join(", ")}`).toEqual([]);
  });

  it("🔴 la ruta que declara el layout EXISTE en `public`", () => {
    // Declarar `icons` sustituye a la convención de `src/app/icon.svg`: si la
    // ruta declarada no está en `public`, el navegador recibe un 404 y enseña
    // el globo genérico. Pasó en producción.
    const layout = readFileSync(resolve(raiz, "src/app/layout.tsx"), "utf8");
    const rutas = [...layout.matchAll(/url:\s*"(\/[^"]+)"|shortcut:\s*"(\/[^"]+)"|apple:\s*"(\/[^"]+)"/g)]
      .map((m) => m[1] ?? m[2] ?? m[3])
      .filter((r): r is string => Boolean(r));
    expect(rutas.length, "el layout no declara ninguna ruta de icono").toBeGreaterThan(0);
    const rotas = rutas.filter((r) => !existsSync(publico(r)));
    expect(rotas, `el layout declara iconos que no están en public: ${rotas.join(", ")}`).toEqual([]);
  });

  it("🔴 el icono y el manifiesto son públicos: el middleware no los manda al login", () => {
    // Sin esto el navegador pedía el icono, recibía un 307 a /login y enseñaba
    // el globo genérico — con el logo bien puesto en el código.
    const mw = readFileSync(resolve(raiz, "src/middleware.ts"), "utf8");
    const publicos = mw.slice(mw.indexOf("const PUBLIC_PATHS"), mw.indexOf("];", mw.indexOf("const PUBLIC_PATHS")));
    expect(publicos).toContain('"/icon.svg"');
    expect(publicos).toContain('"/manifest.webmanifest"');
  });

  it("el layout declara el icono", () => {
    const layout = readFileSync(resolve(raiz, "src/app/layout.tsx"), "utf8");
    expect(layout).toContain("icons:");
    expect(layout).toContain("manifest:");
  });
});
