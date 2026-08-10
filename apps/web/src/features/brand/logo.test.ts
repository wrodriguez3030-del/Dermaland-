import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DERMALAND_LOGO_COLOR,
  DERMALAND_LOGO_PATH,
  dermalandLogoDataUri,
  dermalandLogoSvg,
} from "./logo";

/**
 * El archivo público y el módulo tienen que dibujar LO MISMO.
 *
 * Es la prueba que faltaba: el trazo estaba copiado a mano en varios sitios y
 * ya habían divergido en el color sin que nadie se enterara, porque nada
 * comparaba una copia con otra. Si un día se retoca el SVG público, esto falla
 * y obliga a actualizar también lo que se comparte por WhatsApp.
 */
const SVG_PUBLICO = readFileSync(
  join(process.cwd(), "public/brand/dermaland-logo.svg"),
  "utf8",
);

/** Espacios y saltos de línea no cambian lo que se dibuja. */
function normalizar(d: string): string {
  return d.replace(/\s+/g, " ").trim();
}

describe("logo de marca", () => {
  it("el trazo coincide con el del SVG público", () => {
    const enArchivo = SVG_PUBLICO.match(/\sd="([^"]+)"/)?.[1];
    expect(enArchivo, "el SVG público no tiene atributo d").toBeTruthy();
    expect(normalizar(enArchivo!)).toBe(normalizar(DERMALAND_LOGO_PATH));
  });

  it("el color coincide con el del SVG público", () => {
    const enArchivo = SVG_PUBLICO.match(/fill="(#[0-9A-Fa-f]{6})"/)?.[1];
    expect(enArchivo?.toUpperCase()).toBe(DERMALAND_LOGO_COLOR.toUpperCase());
  });

  it("no es el teal de la interfaz", () => {
    // El color de marca y el de los botones son cosas distintas. Confundirlos
    // fue justo el fallo: la tarjeta de la tienda salía con el logo en teal.
    expect(DERMALAND_LOGO_COLOR.toLowerCase()).not.toBe("#00685f");
  });

  it("conserva fill-rule evenodd, que es lo que cala la «D»", () => {
    expect(dermalandLogoSvg()).toContain('fill-rule="evenodd"');
    expect(SVG_PUBLICO).toContain('fill-rule="evenodd"');
  });

  it("el data URI se puede decodificar y trae el trazo", () => {
    const uri = dermalandLogoDataUri();
    expect(uri.startsWith("data:image/svg+xml;base64,")).toBe(true);
    const svg = Buffer.from(uri.split(",")[1]!, "base64").toString("utf8");
    expect(normalizar(svg)).toContain(normalizar(DERMALAND_LOGO_PATH));
  });

  it("admite forzar el color para fondos oscuros", () => {
    expect(dermalandLogoSvg("#ffffff")).toContain('fill="#ffffff"');
  });
});
