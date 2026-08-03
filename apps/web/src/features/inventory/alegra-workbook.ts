import { resolveColumns, type AlegraRow } from "./alegra-import";

/**
 * Lectura del `.xlsx` de Alegra EN EL NAVEGADOR.
 *
 * El parseo ocurre del lado del cliente y al servidor solo viajan las filas ya
 * normalizadas (nombre + dos cantidades). El servidor NO confía en ellas: valida
 * con Zod y recalcula el plan completo contra la base. Aquí solo convertimos el
 * archivo a datos.
 */

/**
 * Convierte el texto de una celda de cantidad en un entero.
 *
 * Devuelve `NaN` para TODO lo que no sea un entero limpio — celda vacía, `-`,
 * `N/A`, texto libre, decimales — para que `rowTargets` mande esa fila a
 * `skipped` y el usuario la vea en "Filas que no se aplican".
 *
 * Es deliberado que NO caiga a 0. La escritura del importador es ABSOLUTA: un 0
 * inventado no significa "no sé", significa "pon este producto en cero", y
 * borraría su stock en las dos sucursales sin aparecer en ningún reporte.
 *
 * También rechaza en vez de truncar los números escritos como texto. Alegra
 * puede exportar `1,234`; `parseInt` lo leería como `1` y se perderían 1 233
 * unidades en silencio. Los separadores de millar se limpian primero (solo
 * cuando separan grupos de exactamente 3 dígitos, para no confundirlos con
 * decimales); si lo que queda no es un entero exacto, la fila se omite.
 */
function toInt(raw: string): number {
  const s = String(raw ?? "").trim();
  if (s === "") return Number.NaN;
  const sinMiles = s.replace(/(\d)[.,  ](?=\d{3}(?:\D|$))/g, "$1");
  if (!/^[+-]?\d+$/.test(sinMiles)) return Number.NaN;
  const n = Number(sinMiles);
  return Number.isSafeInteger(n) ? n : Number.NaN;
}

/**
 * Convierte una matriz de texto (fila 1 = cabecera) en filas del importador.
 *
 * `rowNumber` es el número de fila REAL de Excel para que el usuario pueda
 * localizar el problema en su archivo: la fila 1 es la cabecera, así que la
 * primera fila de datos es la 2.
 */
export function rowsFromMatrix(matrix: string[][]): AlegraRow[] {
  const [header, ...body] = matrix;
  const col = resolveColumns(header ?? []);
  const out: AlegraRow[] = [];
  body.forEach((cells, i) => {
    const name = String(cells[col.name] ?? "").trim();
    if (!name) return;
    out.push({
      rowNumber: i + 2,
      name,
      qtyPrincipal: toInt(cells[col.qtyPrincipal] ?? ""),
      qtyTotal: toInt(cells[col.qtyTotal] ?? ""),
    });
  });
  return out;
}

/** Texto plano de una celda de ExcelJS (fórmulas, texto enriquecido, hipervínculos). */
function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if ("result" in o) return String(o.result ?? "");
    if ("text" in o) return String(o.text ?? "");
    if ("richText" in o) {
      const parts = o.richText as Array<{ text?: string }> | undefined;
      return (parts ?? []).map((t) => t.text ?? "").join("");
    }
  }
  return String(value);
}

/**
 * Lee un `.xlsx` de Alegra y devuelve las filas del importador.
 *
 * ExcelJS se carga BAJO DEMANDA: pesa ~100 kB comprimido y solo hace falta
 * cuando el usuario elige un archivo, así que no debe entrar en el bundle
 * inicial de la aplicación.
 */
export async function readAlegraWorkbook(file: File): Promise<AlegraRow[]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("El archivo no tiene ninguna hoja de cálculo.");

  // `rowCount`/`columnCount` de ExcelJS son getters que RECORREN la hoja entera.
  // Dejarlos en la condición del bucle los re-evalúa filas × columnas veces:
  // con 5000 filas eso son ~9 segundos congelando la pestaña. Izados: ~2 ms.
  const rowCount = ws.rowCount;
  const colCount = ws.columnCount;

  const matrix: string[][] = [];
  for (let r = 1; r <= rowCount; r++) {
    const row = ws.getRow(r);
    const cells: string[] = [];
    for (let c = 1; c <= colCount; c++) {
      cells.push(cellText(row.getCell(c).value));
    }
    matrix.push(cells);
  }
  return rowsFromMatrix(matrix);
}
