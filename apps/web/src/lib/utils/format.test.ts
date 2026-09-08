import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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

/**
 * 🔴 Formato de fecha `dd/mm/aaaa` en todo el sistema.
 *
 * Pedido del dueño (08/09/2026): «ademas ordemas las fechas dd/mm/aaaa en todo
 * el sistema». Salía «18 jun de 2026» porque los dos formateadores usaban
 * `month: "short"`. El PDF y el Excel ya salían en `dd/mm/aaaa`, así que la
 * pantalla decía una cosa y el papel otra.
 *
 * Las fechas van a mediodía a propósito: así el día no cambia por el huso
 * horario de quien corre las pruebas.
 */
describe("las fechas se leen dd/mm/aaaa", () => {
  it("🔴 fecha corta, con cero delante", () => {
    expect(formatDate("2026-06-08T12:00:00-04:00")).toBe("08/06/2026");
  });

  it("🔴 fecha y hora empieza por dd/mm/aaaa", () => {
    expect(formatDateTime("2026-06-18T14:05:00-04:00")).toMatch(/^18\/06\/2026/);
  });

  it("🔴 ningún mes en letras", () => {
    // «jun», «sept», «dic»… cualquier letra en la parte de la fecha significa
    // que alguien volvió a poner `month: "short"`.
    expect(formatDate("2026-12-01T12:00:00-04:00")).toBe("01/12/2026");
    expect(formatDate("2026-09-30T12:00:00-04:00")).toBe("30/09/2026");
  });
});

/**
 * 🔴 Guardián: nadie formatea una FECHA por su cuenta.
 *
 * Cambiar `format.ts` arregla los 74 sitios que usan los helpers, pero no los
 * que llaman a `toLocaleDateString`/`toLocaleString` sobre un `Date` a mano:
 * esos seguirían diciendo «18/6/2026» (sin cero) o, peor, el formato del
 * navegador de quien mire. Este guardián DESCUBRE los archivos recorriendo el
 * árbol; no lleva una lista que se quede vieja en cuanto alguien añada una
 * pantalla.
 *
 * Lo que SÍ se permite, y por qué:
 *   · `en-CA` — es la forma de sacar `YYYY-MM-DD` para una clave interna
 *     (agrupar por día, un `value` de `<input type="date">`), no algo que un
 *     usuario lea. Cambiarlo rompería datos.
 *   · `toLocaleString("es-DO")` sobre un NÚMERO — es separador de miles, no
 *     una fecha. Por eso se exige que la línea hable de una fecha (`Date`,
 *     `DateTimeFormat`, o una de las variantes de fecha/hora).
 */
describe("nadie formatea una fecha por su cuenta", () => {
  const RAIZ = fileURLToPath(new URL("../..", import.meta.url));

  /** Todos los `.ts`/`.tsx` de `src`, salvo pruebas y este mismo formateador. */
  function fuentes(dir: string, salida: string[] = []): string[] {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const ruta = join(dir, entrada.name);
      if (entrada.isDirectory()) {
        if (entrada.name === "node_modules" || entrada.name === ".next") continue;
        fuentes(ruta, salida);
      } else if (/\.tsx?$/.test(entrada.name) && !/\.test\.tsx?$/.test(entrada.name)) {
        if (ruta.endsWith(join("lib", "utils", "format.ts"))) continue;
        salida.push(ruta);
      }
    }
    return salida;
  }

  it("🔴 ninguna pantalla usa toLocaleDateString ni un DateTimeFormat propio", () => {
    const archivos = fuentes(RAIZ);
    // Suelo contra el recorrido roto: si `fuentes` devolviera poco, el bucle
    // pasaría sin haber mirado el sistema.
    expect(archivos.length, "el recorrido de `src` devolvió muy pocos archivos").toBeGreaterThan(300);

    const culpables: string[] = [];
    for (const archivo of archivos) {
      const lineas = readFileSync(archivo, "utf8").split("\n");
      lineas.forEach((linea, i) => {
        if (linea.includes("en-CA")) return;
        const formateaFecha =
          /\.toLocaleDateString\(/.test(linea) ||
          /\.toLocaleTimeString\(/.test(linea) ||
          /new Intl\.DateTimeFormat\(/.test(linea) ||
          (/\.toLocaleString\(/.test(linea) && /new Date\(|Date\)|fecha|date/i.test(linea));
        if (formateaFecha) {
          culpables.push(`${archivo.slice(RAIZ.length)}:${i + 1}  ${linea.trim().slice(0, 90)}`);
        }
      });
    }
    expect(
      culpables,
      `estos sitios formatean una fecha sin pasar por formatDate/formatDateTime:\n${culpables.join("\n")}`,
    ).toEqual([]);
  });
});

/**
 * 🔴 Una fecha SIN hora no se corre un día.
 *
 * Lo encontró el dueño el 07/09/2026 mirando «Ventas de hoy»: la pantalla
 * enseñaba «06 sept 2026» en las siete ventas del día. Los importes eran
 * correctos —RD$13 531,50, que es justo el total de hoy menos la anulada—, así
 * que el filtro estaba bien: lo que estaba mal era la FECHA pintada.
 *
 * La causa: `alegra_invoices.date` es una columna `date` (sin hora) y llega
 * como «2026-09-07». `new Date("2026-09-07")` la interpreta como MEDIANOCHE
 * UTC, y República Dominicana es UTC-4: en pantalla, las 8 de la noche del día
 * ANTERIOR. Con el 1 de enero se pierde hasta el año — «2026-01-01» salía
 * «31/12/2025».
 *
 * Afecta a las 14 973 facturas migradas, en el listado de ventas, la ficha del
 * cliente y los reportes.
 */
describe("una fecha sin hora se lee tal cual, sin corrimiento", () => {
  it("🔴 el día que dice la base es el día que se enseña", () => {
    expect(formatDate("2026-09-07")).toBe("07/09/2026");
    expect(formatDate("2026-09-06")).toBe("06/09/2026");
  });

  it("🔴 el 1 de enero no se convierte en 31 de diciembre del año anterior", () => {
    expect(formatDate("2026-01-01")).toBe("01/01/2026");
  });

  it("🔴 el último día del mes tampoco se corre", () => {
    expect(formatDate("2026-02-28")).toBe("28/02/2026");
    expect(formatDate("2026-12-31")).toBe("31/12/2026");
  });

  it("una marca de tiempo COMPLETA sigue respetando la zona horaria", () => {
    // Aquí sí hay hora, y convertir es lo correcto: son las 8 de la noche del
    // día 6 en Santo Domingo.
    expect(formatDate("2026-09-07T00:00:00.000Z")).toBe("06/09/2026");
  });

  it("una fecha sin hora tampoco se corre en `formatDateTime`", () => {
    // Sin hora no hay hora que enseñar: se pinta el día a secas.
    expect(formatDateTime("2026-09-07")).toBe("07/09/2026");
  });

  it("lo inválido sigue siendo una raya", () => {
    expect(formatDate("2026-13-45")).toBe("—");
    expect(formatDate("")).toBe("—");
  });

  it("🔴 un día que NO existe no se pinta como si existiera", () => {
    // Sin esta comprobación, el atajo de «fecha sin hora» devolvería
    // «31/02/2026» tal cual: una fecha inventada, y encima con cara de buena.
    // La primera versión de esta prueba no existía y la mutación sobrevivió.
    expect(formatDate("2026-02-31")).toBe("—");
    expect(formatDate("2026-04-31")).toBe("—");
    expect(formatDate("2025-02-29")).toBe("—");
    // Pero un bisiesto de verdad sí vale.
    expect(formatDate("2024-02-29")).toBe("29/02/2024");
  });
});
