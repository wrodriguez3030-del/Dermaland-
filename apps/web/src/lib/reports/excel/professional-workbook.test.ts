import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import {
  buildProfessionalWorkbook,
  reportFileName,
  sanitizeSheetName,
  NUM_FMT,
} from "./professional-workbook";
import { toExcelDate } from "./excel-date";
import type { WorkbookSpec } from "./types";

/**
 * Genera un .xlsx REAL con ExcelJS y lo RE-LEE desde el buffer para
 * verificar que el archivo abre correctamente y que hojas, formatos,
 * AutoFilter, freeze panes y totales están presentes. (Un archivo que
 * ExcelJS puede re-leer es un XLSX válido — no HTML ni CSV renombrado.)
 */

const UUID = "d76d0d15-815e-4f56-a9ae-7fc21bc58af9";

const SPEC: WorkbookSpec = {
  meta: {
    title: "Reporte de prueba",
    rangeLabel: "Todo",
    branchLabel: "Todas las sucursales",
    filtersLabel: "Sin filtros adicionales",
    generatedBy: "Wilson Rodríguez",
    generatedAtLabel: "06 jul de 2026, 04:06 p. m.",
  },
  sheets: [
    {
      name: "Resumen",
      kpis: [
        { label: "Total facturado", value: 29628, format: "currency" },
        { label: "Transacciones", value: 13, format: "int" },
      ],
      tables: [
        {
          title: "Métodos de pago",
          columns: [
            { header: "Método", key: "label" },
            { header: "Monto", key: "amount", format: "currency" },
            { header: "Porcentaje", key: "pct", format: "percent" },
          ],
          rows: [
            { label: "Efectivo", amount: 20000, pct: 0.675 },
            { label: "Tarjeta", amount: 9628, pct: 0.325 },
          ],
          totals: { label: "TOTAL", amount: 29628, pct: 1 },
        },
      ],
    },
    {
      name: "Detalle",
      tables: [
        {
          columns: [
            { header: "Fecha", key: "date", format: "datetime" },
            { header: "Cliente", key: "customer" },
            { header: "Total", key: "total", format: "currency" },
          ],
          rows: [
            {
              date: toExcelDate("2026-07-04T14:21:00"),
              customer: "WILLIAN R RODRIGUEZ",
              total: 1990,
            },
            {
              date: toExcelDate("2026-07-04T14:20:00"),
              customer: "WILLIAN R RODRIGUEZ",
              total: 1990,
            },
          ],
          totals: { date: "TOTALES", total: 3980 },
        },
      ],
    },
  ],
};

async function roundTrip(spec: WorkbookSpec): Promise<ExcelJS.Workbook> {
  const wb = buildProfessionalWorkbook(ExcelJS, spec);
  const buffer = await wb.xlsx.writeBuffer();
  const read = new ExcelJS.Workbook();
  await read.xlsx.load(buffer as ArrayBuffer);
  return read;
}

describe("buildProfessionalWorkbook — XLSX real", () => {
  it("genera y RE-ABRE un .xlsx válido con las hojas esperadas", async () => {
    const wb = await roundTrip(SPEC);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Resumen", "Detalle"]);
  });

  it("encabezado corporativo: DermaLand + título + metadatos en cada hoja", async () => {
    const wb = await roundTrip(SPEC);
    for (const ws of wb.worksheets) {
      expect(ws.getCell("A1").value).toBe("DermaLand");
      expect(ws.getCell("A2").value).toBe("Reporte de prueba");
      const metaText = [3, 4, 5, 6, 7]
        .map((r) => String(ws.getRow(r).getCell(1).value ?? ""))
        .join("\n");
      expect(metaText).toContain("Rango: Todo");
      expect(metaText).toContain("Sucursal: Todas las sucursales");
      expect(metaText).toContain("Generado por: Wilson Rodríguez");
    }
  });

  it("montos son NÚMEROS con formato RD$ (nunca texto)", async () => {
    const wb = await roundTrip(SPEC);
    const detalle = wb.getWorksheet("Detalle")!;
    let currencyCells = 0;
    detalle.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.numFmt === NUM_FMT.currency) {
          expect(typeof cell.value).toBe("number");
          currencyCells++;
        }
      });
    });
    expect(currencyCells).toBeGreaterThanOrEqual(3); // 2 filas + TOTAL
  });

  it("fechas son fechas REALES de Excel con formato dd/mm/yyyy hh:mm", async () => {
    const wb = await roundTrip(SPEC);
    const detalle = wb.getWorksheet("Detalle")!;
    let dateCells = 0;
    detalle.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.numFmt === NUM_FMT.datetime && cell.value instanceof Date) {
          dateCells++;
        }
      });
    });
    expect(dateCells).toBe(2);
  });

  it("porcentajes usan 0.00% y el TOTAL de la tabla cuadra", async () => {
    const wb = await roundTrip(SPEC);
    const resumen = wb.getWorksheet("Resumen")!;
    const values: { fmt: string; v: unknown }[] = [];
    resumen.eachRow((row) =>
      row.eachCell((cell) => values.push({ fmt: cell.numFmt ?? "", v: cell.value })),
    );
    expect(values.some((c) => c.fmt === NUM_FMT.percent && c.v === 1)).toBe(true);
    expect(values.some((c) => c.fmt === NUM_FMT.currency && c.v === 29628)).toBe(true);
    expect(values.some((c) => c.v === "TOTAL")).toBe(true);
  });

  it("AutoFilter y freeze panes existen en hojas con tabla", async () => {
    const wb = await roundTrip(SPEC);
    const detalle = wb.getWorksheet("Detalle")!;
    expect(detalle.autoFilter).toBeTruthy();
    expect(detalle.views?.[0]?.state).toBe("frozen");
    expect((detalle.views?.[0] as { ySplit?: number })?.ySplit).toBeGreaterThan(0);
  });

  it("no contiene UUIDs ni secretos en ninguna celda", async () => {
    const wb = await roundTrip(SPEC);
    const all: string[] = [];
    for (const ws of wb.worksheets) {
      ws.eachRow((row) => row.eachCell((c) => all.push(String(c.value ?? ""))));
    }
    const text = all.join("\n");
    expect(text).not.toContain(UUID);
    expect(text).not.toMatch(/service_role|sb_secret|supabase|token/i);
  });
});

describe("helpers", () => {
  it("reportFileName: Reporte_Ventas_DermaLand_YYYY-MM-DD.xlsx", () => {
    const name = reportFileName("Reporte_Ventas", new Date("2026-07-06T12:00:00Z"));
    expect(name).toBe("Reporte_Ventas_DermaLand_2026-07-06.xlsx");
  });

  it("sanitizeSheetName: quita caracteres inválidos y limita a 31", () => {
    expect(sanitizeSheetName("Ventas: [detalle]/completo?*")).not.toMatch(/[\\/?*[\]:]/);
    expect(sanitizeSheetName("x".repeat(50)).length).toBe(31);
  });

  it("toExcelDate conserva la hora local de pared (RD)", () => {
    const d = toExcelDate("2026-07-04T14:21:00")!;
    // Los componentes UTC del Date resultante = componentes locales originales.
    expect(d.getUTCHours()).toBe(14);
    expect(d.getUTCMinutes()).toBe(21);
    expect(toExcelDate(null)).toBeNull();
    expect(toExcelDate("no-es-fecha")).toBeNull();
  });
});
