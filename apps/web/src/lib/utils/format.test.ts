import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatTime } from "./format";

/**
 * Estas pruebas existen por un incidente concreto (2026-08-06).
 *
 * `Intl.DateTimeFormat.format()` no devuelve "Invalid Date": **lanza**
 * `RangeError: Invalid time value`. Como los formateadores se llaman en pleno
 * render, esa excepción no rompía una celda: tumbaba el POS entero con
 * "Application error: a client-side exception has occurred".
 *
 * El disparador fue una línea de servicio (el envío de un pedido web) sin fecha
 * de vencimiento, que llegó como `""`.
 */
describe("formatDate y compañía ante una fecha ausente o inválida", () => {
  const invalidas: [string, Date | string][] = [
    ["cadena vacía (el caso real del POS)", ""],
    ["solo espacios", "   "],
    ["texto que no es fecha", "no-es-una-fecha"],
    ["Date inválido", new Date("x")],
    ["fecha a medias", "2026-13-45"],
  ];

  for (const [nombre, valor] of invalidas) {
    it(`no lanza con ${nombre}`, () => {
      expect(() => formatDate(valor)).not.toThrow();
      expect(() => formatDateTime(valor)).not.toThrow();
      expect(() => formatTime(valor)).not.toThrow();
    });

    it(`devuelve una raya con ${nombre}, no una fecha inventada`, () => {
      expect(formatDate(valor)).toBe("—");
      expect(formatDateTime(valor)).toBe("—");
      expect(formatTime(valor)).toBe("—");
    });
  }

  it("una fecha buena se sigue formateando", () => {
    // La guarda no debe tragarse las fechas válidas: si esta prueba pasara con
    // un "—", la proteccion habria roto lo que venia a proteger.
    const salida = formatDate("2026-08-06T12:00:00Z");
    expect(salida).not.toBe("—");
    expect(salida).toMatch(/2026/);
  });

  it("acepta un Date igual que una cadena", () => {
    expect(formatDate(new Date("2026-08-06T12:00:00Z"))).toMatch(/2026/);
  });
});
