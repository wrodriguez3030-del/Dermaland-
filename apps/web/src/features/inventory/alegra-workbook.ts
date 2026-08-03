import { resolveColumns, type AlegraRow } from "./alegra-import";

/**
 * Lectura del `.xlsx` de Alegra EN EL NAVEGADOR.
 *
 * El parseo ocurre del lado del cliente y al servidor solo viajan las filas ya
 * normalizadas (nombre + dos cantidades). El servidor NO confía en ellas: valida
 * con Zod y recalcula el plan completo contra la base. Aquí solo convertimos el
 * archivo a datos.
 */

/** Entero tolerante: celdas vacías o no numéricas cuentan como 0. */
function toInt(raw: string): number {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  return Number.isFinite(n) ? n : 0;
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

  const matrix: string[][] = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const cells: string[] = [];
    for (let c = 1; c <= ws.columnCount; c++) {
      cells.push(cellText(row.getCell(c).value));
    }
    matrix.push(cells);
  }
  return rowsFromMatrix(matrix);
}
