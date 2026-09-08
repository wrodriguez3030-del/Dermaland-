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

  it("el layout declara el icono", () => {
    const layout = readFileSync(resolve(raiz, "src/app/layout.tsx"), "utf8");
    expect(layout).toContain("icons:");
    expect(layout).toContain("manifest:");
  });
});
