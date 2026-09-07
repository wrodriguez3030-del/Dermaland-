import { describe, it, expect } from "vitest";
import type { ReceivableRow } from "@/features/receivables/receivables-client";
import {
  CABECERA_CSV,
  csvPendientes,
  etiquetaFiltrosCxc,
  seccionFacturasVencidas,
  tablaPendientesExcel,
} from "./exports-cxc";

/**
 * 🔴 Los tres exports de Cuentas por Cobrar SALEN DEL EDIFICIO.
 *
 * El PDF «Facturas vencidas» es la lista con la que la encargada llama a los
 * clientes. Desde que `listPending` une las dos fuentes, ahí dentro hay deuda
 * migrada cuyo pago se registra en Alegra: si el papel no lo dice, se reclama
 * por teléfono algo que ya se pagó —o que se va a pagar— en el otro sistema.
 * Mismo fallo, mismo módulo y mismo arreglo que el PDF del estado de cuenta.
 * En un papel no hay `title` al pasar el ratón: o se lee, o no existe.
 */

const fila = (over: Partial<ReceivableRow>): ReceivableRow =>
  ({
    id: "p1",
    number: "FAC-1",
    ecfNumber: null,
    customerId: "c1",
    customerName: "Ana",
    customerPhone: null,
    branchId: "b1",
    branchName: "Principal",
    sellerName: null,
    cashierName: "Rosa",
    issuedAt: "2026-09-01",
    dueDate: "2026-08-01",
    creditDays: 30,
    overdueDays: 35,
    bucket: "v31_60",
    total: 1000,
    paid: 0,
    balance: 1000,
    status: "issued",
    origen: "sistema",
    cobrable: true,
    motivoNoCobrable: null,
    ...over,
  }) as ReceivableRow;

const migrada = fila({
  id: "a1",
  number: "B0100000123",
  origen: "alegra",
  cobrable: false,
  motivoNoCobrable: "…",
  balance: 600,
  total: 600,
});

/**
 * Divide una línea de `csvPendientes` (cada campo entre comillas, dobladas
 * si el valor las trae) en sus campos, EN EL ORDEN en que aparecen. Es el
 * mismo escapado que `escapa()` en `exports-cxc.ts`, deshecho.
 */
const camposCsv = (linea: string): string[] =>
  linea
    .slice(1, -1) // fuera las comillas exteriores del primer y del último campo
    .split('","')
    .map((c) => c.replace(/""/g, '"'));

describe("PDF de cuentas por cobrar · «Facturas vencidas»", () => {
  it("🔴 cada fila dice su origen EN EL PAPEL", () => {
    const s = seccionFacturasVencidas([fila({}), migrada]);
    expect(s.table.columns.map((c) => c.key)).toContain("origen");
    expect(s.table.rows[0]!.origen).toBe("Sistema");
    expect(s.table.rows[1]!.origen).toBe("Migrada de Alegra");
  });

  it("🔴 y una nota al pie explica que esas se cobran en Alegra", () => {
    const s = seccionFacturasVencidas([fila({}), migrada]);
    expect(s.footnote).toBeDefined();
    expect(s.footnote).toMatch(/se registra en Alegra/i);
  });

  it("🔴 la nota va en `footnote` de la SECCIÓN, no en una `note` de la tabla", () => {
    // El motor solo pinta `PdfSection.footnote` (`report-pdf.ts`). `PdfTable`
    // no tiene clave `note`: ponerla ahí la descarta EN SILENCIO y el papel
    // sale igual de mudo. Esta prueba muere si alguien la vuelve a mover.
    const s = seccionFacturasVencidas([migrada]);
    expect(s.footnote).toBeDefined();
    expect(s.table).not.toHaveProperty("note");
    expect(JSON.stringify(s.table)).not.toMatch(/se registra en Alegra/i);
  });

  it("sin deuda migrada no hay nota que poner", () => {
    expect(seccionFacturasVencidas([fila({})]).footnote).toBeUndefined();
  });

  it("el TOTAL es la suma de los saldos listados", () => {
    const s = seccionFacturasVencidas([fila({}), migrada]);
    expect(s.table.totals?.balance).toBe(1600);
  });
});

describe("Excel de cuentas por cobrar", () => {
  it("🔴 la hoja «Pendientes» lleva columna Origen con las dos etiquetas", () => {
    const t = tablaPendientesExcel([fila({}), migrada]);
    expect(t.columns.map((c) => c.key)).toContain("origen");
    expect(t.rows[0]!.origen).toBe("Sistema");
    expect(t.rows[1]!.origen).toBe("Migrada de Alegra");
  });

  it("🔴 y la cabecera del libro avisa: es lo único que llega a las hojas agregadas", () => {
    // «Morosos» y «Por vendedor» agrupan y no pueden llevar columna de origen;
    // `TableSpec` no tiene clave de nota y `ReportMeta` tampoco. `filtersLabel`
    // es el único hueco que `professional-workbook` pinta de verdad.
    expect(etiquetaFiltrosCxc([fila({}), migrada])).toMatch(/se registra en Alegra/i);
  });

  it("sin deuda migrada la cabecera vuelve a su texto de siempre", () => {
    expect(etiquetaFiltrosCxc([fila({})])).toBe("Sin filtros adicionales");
  });

  it("el TOTAL de la hoja es la suma de los saldos, sin arrastre de céntimos", () => {
    const t = tablaPendientesExcel([fila({ balance: 0.1 }), fila({ id: "p2", balance: 0.2 })]);
    expect(t.totals?.balance).toBe(0.3);
  });
});

describe("CSV de cuentas por cobrar", () => {
  it("🔴 la columna Origen está en la cabecera y en cada fila", () => {
    // El CSV no tiene meta de ninguna clase: la columna es la ÚNICA vía.
    expect(CABECERA_CSV.split(",")).toContain("Origen");
    const csv = csvPendientes([fila({}), migrada]);
    const lineas = csv.split("\r\n");
    expect(lineas[0]).toBe(CABECERA_CSV);
    expect(lineas[1]).toContain('"Sistema"');
    expect(lineas[2]).toContain('"Migrada de Alegra"');
  });

  it("la cabecera y las filas tienen el mismo número de columnas", () => {
    // Una columna añadida a la cabecera y olvidada en la fila desplaza TODO el
    // fichero una casilla: el saldo aparecería bajo «Monto».
    const csv = csvPendientes([fila({}), migrada]);
    const columnas = CABECERA_CSV.split(",").length;
    for (const linea of csv.split("\r\n").slice(1)) {
      expect(linea.split('","').length).toBe(columnas);
    }
  });

  it("las comillas del nombre de un cliente no rompen el fichero", () => {
    const csv = csvPendientes([fila({ customerName: 'Ana "La Doña"' })]);
    expect(csv).toContain('"Ana ""La Doña"""');
  });

  it("🔴 el ORDEN de las columnas de la fila coincide con el de la cabecera (N5)", () => {
    // Las otras tres pruebas de este bloque NO fijan el orden: comprueban que
    // "Origen" está en algún sitio, que hay el mismo NÚMERO de columnas, y
    // que las comillas no rompen el fichero. Ninguna nota si `Monto` y
    // `Saldo` cambian de posición en `CABECERA_CSV` sin que la fila cambie
    // con ellos — que es justo el fallo que el comentario de la prueba
    // anterior ("el saldo aparecería bajo «Monto»") dice que hay que evitar.
    // Esta empareja cada valor con el NOMBRE de su columna, no con su índice.
    const csv = csvPendientes([fila({ total: 1000, balance: 850 })]);
    const [cabecera, filaCsv] = csv.split("\r\n");
    const encabezados = cabecera!.split(",");
    const valores = camposCsv(filaCsv!);
    expect(valores.length).toBe(encabezados.length);
    const porNombre = Object.fromEntries(encabezados.map((h, i) => [h, valores[i]]));
    expect(porNombre["Factura"]).toBe("FAC-1");
    expect(porNombre["Origen"]).toBe("Sistema");
    expect(porNombre["Sucursal"]).toBe("Principal");
    expect(porNombre["DiasVencidos"]).toBe("35");
    expect(porNombre["Monto"]).toBe("1000");
    expect(porNombre["Saldo"]).toBe("850");
    expect(porNombre["Estado"]).toBe("Vencida 31-60");
  });
});
