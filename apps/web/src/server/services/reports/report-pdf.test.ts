import { describe, it, expect } from "vitest";
import zlib from "node:zlib";
import { generateReportPdf } from "./report-pdf";
import type {
  ReportPdfSpec,
  PdfColumn,
  PdfKpi,
  PdfSection,
} from "@/lib/reports/pdf/types";

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades de inspección del PDF (sin dependencias externas).
// ─────────────────────────────────────────────────────────────────────────────

/** Nº de páginas reales (objetos `/Type /Page`, sin contar el árbol `/Pages`). */
function pageCount(buf: Buffer): number {
  return (buf.toString("latin1").match(/\/Type\s*\/Page(?![s])/g) ?? []).length;
}

/**
 * Detecta páginas EN BLANCO: descomprime el content stream de cada página y
 * cuenta operadores de texto (Tj/TJ). Una página sin texto real = en blanco.
 * Devuelve los números (1-based) de las páginas en blanco.
 */
function blankPages(buf: Buffer): number[] {
  const s = buf.toString("latin1");
  const objs: Record<number, { dict: string; st: number }> = {};
  const starts: { num: number; start: number }[] = [];
  const re = /(\d+)\s+0\s+obj\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) starts.push({ num: +m[1]!, start: m.index });
  for (let i = 0; i < starts.length; i++) {
    const st = starts[i]!.start;
    const en = i + 1 < starts.length ? starts[i + 1]!.start : s.length;
    objs[starts[i]!.num] = { dict: s.slice(st, en), st };
  }
  // Orden de páginas según /Kids del árbol Pages (si existe).
  let order = Object.keys(objs)
    .map(Number)
    .filter((n) => /\/Type\s*\/Page(?![s])/.test(objs[n]!.dict));
  const pagesTree = Object.values(objs).find((o) => /\/Type\s*\/Pages\b/.test(o.dict));
  const km = pagesTree?.dict.match(/\/Kids\s*\[([^\]]*)\]/);
  if (km) {
    const kids = [...km[1]!.matchAll(/(\d+)\s+0\s+R/g)].map((x) => +x[1]!).filter((n) => objs[n]);
    if (kids.length) order = kids;
  }
  const blanks: number[] = [];
  order.forEach((pn, idx) => {
    const cm = objs[pn]!.dict.match(/\/Contents\s+(\d+)\s+0\s+R/);
    if (!cm) { blanks.push(idx + 1); return; }
    const od = objs[+cm[1]!];
    if (!od) { blanks.push(idx + 1); return; }
    const so = s.indexOf("stream", od.st);
    const eo = s.indexOf("endstream", so);
    let a = so + 6;
    if (s[a] === "\r") a++;
    if (s[a] === "\n") a++;
    const raw = buf.subarray(a, eo);
    let data: Buffer;
    try { data = zlib.inflateSync(raw); }
    catch { try { data = zlib.inflateRawSync(raw); } catch { data = raw; } }
    const cs = data.toString("latin1");
    const textOps = (cs.match(/\)\s*Tj/g) ?? []).length + (cs.match(/\]\s*TJ/g) ?? []).length;
    if (textOps === 0) blanks.push(idx + 1);
  });
  return blanks;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constructores de spec de prueba.
// ─────────────────────────────────────────────────────────────────────────────

const COLS: PdfColumn[] = [
  { header: "No.", key: "idx", format: "index" },
  { header: "Producto", key: "name", format: "text", weight: 2 },
  { header: "Marca", key: "brand", format: "text" },
  { header: "Cant", key: "qty", format: "int" },
  { header: "Precio", key: "price", format: "currency" },
  { header: "Total", key: "total", format: "currency" },
];
const WIDE: PdfColumn[] = [
  ...COLS.slice(0, 3),
  { header: "Lab", key: "lab", format: "text" },
  { header: "Cat", key: "cat", format: "text" },
  { header: "Cant", key: "qty", format: "int" },
  { header: "Costo", key: "cost", format: "currency" },
  { header: "Precio", key: "price", format: "currency" },
  { header: "Margen", key: "m", format: "percent" },
  { header: "Total", key: "total", format: "currency" },
];

function rows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    idx: null,
    name: `Producto ${i + 1} con nombre de prueba`,
    brand: `Marca ${(i % 7) + 1}`,
    lab: `Lab ${(i % 4) + 1}`,
    cat: `Cat ${(i % 3) + 1}`,
    qty: (i % 9) + 1,
    cost: 50 + i,
    price: 100 + i,
    m: 0.2 + (i % 10) / 100,
    total: (100 + i) * ((i % 9) + 1),
  }));
}

function spec(opts: {
  rows?: number;
  kpis?: boolean;
  totals?: boolean;
  orientation?: "portrait" | "landscape" | "auto";
  columns?: PdfColumn[];
  sections?: PdfSection[];
  empty?: string;
}): ReportPdfSpec {
  const cols = opts.columns ?? COLS;
  const kpis: PdfKpi[] = opts.kpis
    ? [
        { label: "Ventas", value: 123456.78, format: "currency", tone: "good" },
        { label: "Transacciones", value: opts.rows ?? 0, format: "int" },
        { label: "Ticket", value: 987.65, format: "currency" },
        { label: "Margen", value: 0.42, format: "percent", tone: "warn" },
      ]
    : [];
  const sections: PdfSection[] = opts.sections ?? [
    {
      title: "Detalle",
      table: {
        columns: cols,
        rows: rows(opts.rows ?? 0),
        totals: opts.totals ? { total: 999999.99 } : undefined,
        emptyMessage: opts.empty ?? "No hay datos en el período seleccionado.",
      },
    },
  ];
  return {
    meta: {
      title: "Reporte de prueba",
      subtitle: "Resumen por período",
      cutLabel: "Corte: 08/07/2026",
      periodLabel: "Julio 2026",
      branchLabel: "DermaLand Cutis",
      businessName: "DermaLand",
      filtersLabel: "Sin filtros",
      generatedBy: "Tester",
      generatedAtLabel: "08/07/2026 10:30 AM",
      reportKind: "Reporte de prueba",
    },
    orientation: opts.orientation,
    kpis,
    sections,
  };
}

const gen = (o: Parameters<typeof spec>[0]) => generateReportPdf(spec(o));

// ─────────────────────────────────────────────────────────────────────────────
// Tests obligatorios (páginas en blanco / paginación).
// ─────────────────────────────────────────────────────────────────────────────

describe("report-pdf · paginación sin páginas en blanco", () => {
  it("1. CASO A: 0 registros → 1 página (no genera página extra)", async () => {
    const buf = await gen({ rows: 0, kpis: true });
    expect(pageCount(buf)).toBe(1);
    expect(blankPages(buf)).toEqual([]);
  });

  it("2. CASO B: 1 registro → 1 página", async () => {
    const buf = await gen({ rows: 1, kpis: true, totals: true });
    expect(pageCount(buf)).toBe(1);
    expect(blankPages(buf)).toEqual([]);
  });

  it("6. CASO F: solo KPIs (0 filas) → 1 página", async () => {
    const buf = await gen({ rows: 0, kpis: true });
    expect(pageCount(buf)).toBe(1);
  });

  it("3-4. CASO C/D: página exacta → 1 página; una fila más → 2 (ninguna en blanco)", async () => {
    // Buscar el máximo de filas que cabe en 1 página (sin KPIs).
    let fit = 1;
    for (let n = 1; n <= 60; n++) {
      const b = await gen({ rows: n, totals: false });
      if (pageCount(b) === 1) fit = n; else break;
    }
    const exact = await gen({ rows: fit, totals: false });
    const oneMore = await gen({ rows: fit + 1, totals: false });
    expect(pageCount(exact)).toBe(1); // llena la página, NO deja página 2 vacía
    expect(blankPages(exact)).toEqual([]);
    expect(pageCount(oneMore)).toBe(2);
    expect(blankPages(oneMore)).toEqual([]); // la 2ª página tiene contenido real
  });

  it("5. CASO E: tabla grande (200 filas) → multipágina sin páginas en blanco", async () => {
    const buf = await gen({ rows: 200, kpis: true, totals: true });
    expect(pageCount(buf)).toBeGreaterThan(1);
    expect(pageCount(buf)).toBeLessThan(12); // sin inflado (~6)
    expect(blankPages(buf)).toEqual([]);
  });

  it("7. fila TOTAL no crea una página vacía (justo en el límite)", async () => {
    // Probar cada tamaño alrededor del salto: el TOTAL nunca deja una página previa vacía.
    for (let n = 25; n <= 40; n++) {
      const buf = await gen({ rows: n, totals: true });
      expect(blankPages(buf), `filas=${n}`).toEqual([]);
    }
  });

  it("8. PORTRAIT funciona sin páginas en blanco", async () => {
    const buf = await gen({ rows: 90, totals: true, orientation: "portrait" });
    expect(blankPages(buf)).toEqual([]);
  });

  it("9. LANDSCAPE funciona sin páginas en blanco", async () => {
    const buf = await gen({ rows: 90, totals: true, orientation: "landscape", columns: WIDE });
    expect(pageCount(buf)).toBeGreaterThan(1);
    expect(blankPages(buf)).toEqual([]);
  });

  it("multi-sección (varias tablas) no genera páginas en blanco", async () => {
    const mk = (title: string, n: number): PdfSection => ({
      title,
      table: { columns: COLS, rows: rows(n), totals: { total: 1 }, emptyMessage: "—" },
    });
    const buf = await generateReportPdf(
      spec({ kpis: true, sections: [mk("Resumen", 3), mk("Por sucursal", 8), mk("Detalle", 55)] }),
    );
    expect(blankPages(buf)).toEqual([]);
  });

  it("secciones vacías (0 filas c/u) → 1 página, sin blancas", async () => {
    const mk = (title: string): PdfSection => ({
      title,
      table: { columns: COLS, rows: [], emptyMessage: "Sin datos." },
    });
    const buf = await generateReportPdf(spec({ kpis: true, sections: [mk("A"), mk("B")] }));
    expect(pageCount(buf)).toBe(1);
    expect(blankPages(buf)).toEqual([]);
  });

  it("15-16. el PDF abre correctamente (cabecera %PDF y sin error)", async () => {
    const buf = await gen({ rows: 10, kpis: true, totals: true });
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(1000);
  });
});
