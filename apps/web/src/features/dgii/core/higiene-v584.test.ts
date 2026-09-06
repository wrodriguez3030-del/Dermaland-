// Portada de agendapp: tests/unit/dgii-higiene-v584.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { esResumenRfce, resolveEcfDelivery } from "./rfce-routing";
import { ENCF_IMPRESO_RE } from "./print-representation";
import { rutaPortada } from "./__port__/rutas";

/**
 * v584 — Higiene: las señales que dejaron de significar algo.
 *
 * Ninguno de estos rompe nada hoy. Todos hacen que la próxima persona que mire el módulo
 * saque una conclusión falsa, y eso ya nos costó tiempo esta misma semana.
 */

const leer = (rel: string) => readFileSync(rutaPortada(rel), "utf8");
const soloCodigo = (rel: string) =>
  leer(rel)
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\*.*$/gm, "");

describe("v584 · 1 — la condición del RFCE, en un solo sitio", () => {
  it("el predicado decide igual que el enrutador", () => {
    // Si divergen, el QR apunta a un servicio y el envío va a otro: la clienta escanea y
    // no encuentra su comprobante.
    for (const [tipo, monto] of [["32", 100], ["32", 249_999.99], ["32", 250_000], ["31", 100], ["34", 10]] as const) {
      const porEnrutador = resolveEcfDelivery({ tipoEcf: tipo, montoTotalDop: monto }).kind === "rfce";
      expect(esResumenRfce({ tipoEcf: tipo, montoTotalDop: monto }), `${tipo} · ${monto}`).toBe(porEnrutador);
    }
  });

  it("sólo el 32 bajo el tope es resumen", () => {
    expect(esResumenRfce({ tipoEcf: "32", montoTotalDop: 249_999.99 })).toBe(true);
    expect(esResumenRfce({ tipoEcf: "32", montoTotalDop: 250_000 })).toBe(false);
    expect(esResumenRfce({ tipoEcf: "31", montoTotalDop: 1 })).toBe(false);
  });

  it("un total inutilizable no se resuelve a «resumen» por defecto", () => {
    // Mandarlo al servicio equivocado en silencio es peor que fallar.
    expect(esResumenRfce({ tipoEcf: "32", montoTotalDop: Number.NaN })).toBe(false);
  });

  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/simulation-ri.ts.
  it.skip("y el generador del QR ya no reimplementa la regla", () => {
    const s = soloCodigo("src/lib/dgii/simulation-ri.ts");
    expect(s, "vuelve a decidir el RFCE por su cuenta").not.toMatch(/tipo === "32"\s*&&/);
    expect(s).toContain("esResumenRfce");
  });
});

describe("v584 · 2 — el formato estricto de e-NCF, en un solo sitio", () => {
  it("acepta lo que la representación impresa exige", () => {
    expect(ENCF_IMPRESO_RE.test("E310000000001")).toBe(true);
    expect(ENCF_IMPRESO_RE.test("E340000000001")).toBe(true);
  });

  it("y rechaza lo que el XSD admite pero la RI no sabe pintar", () => {
    // El del builder es `/^[A-Za-z0-9]{13}$/`: 13 alfanuméricos cualesquiera. Éste es un
    // subconjunto, no una regla que lo contradiga — por eso conviven, y por eso hay que
    // decirlo en un sitio en vez de repetir la regex.
    expect(ENCF_IMPRESO_RE.test("ABCDEFGHIJKLM")).toBe(false);
    expect(ENCF_IMPRESO_RE.test("E31000000000")).toBe(false); // un dígito de menos
  });

  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/ri-generator.ts.
  it.skip("nadie vuelve a escribir la regex a mano", () => {
    for (const f of ["src/lib/dgii/ri-generator.ts", "src/lib/dgii/official-dataset.ts"]) {
      expect(soloCodigo(f), `${f} repite la regex`).not.toMatch(/\/\^E\\d\{2\}\\d\{10\}\$\//);
    }
  });
});

describe("v584 · 4 — la certificación deja de decir «No iniciada»", () => {
  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/certification-matrix.ts.
  it.skip("el registry estático sigue siendo el PLAN, con su valor por defecto", () => {
    // No se toca: `NOT_STARTED` es lo correcto para un registry que describe el plan del
    // software, sin tenant delante.
    expect(leer("src/lib/dgii/certification-matrix.ts")).toContain('estadoCertificacion: "NOT_STARTED"');
  });

  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/tenant-capabilities.ts.
  it.skip("y la capa por tenant lo compone con lo que de verdad pasó", () => {
    // `tenant-capabilities` ya existe para esto: «compone el registry canónico con el
    // estado real del tenant». Faltaba componer también la certificación.
    const s = soloCodigo("src/lib/dgii/tenant-capabilities.ts");
    expect(s).toMatch(/estadoCertificacion/);
    expect(s).toMatch(/certification|lifecycle|completed/i);
  });
});

describe("v584 · 5 — la respuesta de la DGII es la de la DGII", () => {
  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/submission-service.ts.
  it.skip("ya no se guarda un XML fabricado por nosotros", () => {
    const s = soloCodigo("src/lib/dgii/submission-service.ts");
    expect(s, "sigue persistiendo un resumen propio con nombre de prueba documental").not.toMatch(
      /<DgiiResponse><trackId>/,
    );
  });

  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/submission-service.ts.
  it.skip("se persiste el cuerpo real, con el límite que ya existe", () => {
    const s = soloCodigo("src/lib/dgii/submission-service.ts");
    expect(s).toMatch(/bodyText|rawBody/);
  });

  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/submission-service.ts.
  it.skip("y si el storage falla deja de ser mudo", () => {
    // Era `catch { /* storage best-effort */ }`. Un fallo que no se cuenta es un fallo que
    // nadie arregla.
    const s = leer("src/lib/dgii/submission-service.ts");
    const i = s.indexOf("await saveDgiiResponsePayload"); // la llamada, no el import
    expect(i).toBeGreaterThan(-1);
    expect(s.slice(i, i + 700)).toMatch(/avisos|warnings/);
  });
});

describe("v584 · 3 — las migraciones dicen la verdad sobre sí mismas", () => {
  // PENDIENTE fase 9 (ensayo completo y empaquetado): revive cuando exista prisma/migrations.
  it.skip("ningún archivo se llama PENDING si su objeto ya existe en la base", async () => {
    /**
     * De 11 comprobadas, 9 estaban aplicadas: `suppliers`, `purchases`, `received_ecf`,
     * `received_commercial_approvals`, `cash_register_session_ecf_items`,
     * `dgii_certification_*`, `petty_expenses`, `foreign_payments`. Con ese ruido, el
     * prefijo dejó de significar nada — y alguien que empiece la Fase 3 confiando en él
     * pierde una tarde.
     *
     * Este test es la red: renombrar a mano hoy vuelve a mentir en tres semanas.
     */
    const dir = rutaPortada("prisma/migrations");
    const pendientes = readdirSync(dir).filter((f) => f.startsWith("PENDING_") && f.endsWith(".sql"));
    const yaAplicadas = pendientes.filter((f) => {
      const sql = readFileSync(resolve(dir, f), "utf8");
      const m = /create table (?:if not exists )?"?(?:public\.)?"?([a-z_]+)"?/i.exec(sql);
      return m ? TABLAS_APLICADAS.has(m[1]!) : false;
    });
    expect(yaAplicadas, `estos archivos dicen PENDING y su tabla existe: ${yaAplicadas.join(", ")}`).toEqual([]);
  });
});

/**
 * Las tablas que EXISTEN en producción, comprobadas contra la base el 23/08/2026. Se
 * mantiene a mano a propósito: un test unitario no debe abrir conexiones, y la lista sólo
 * crece cuando alguien aplica una migración —momento en el que toca renombrarla igual.
 */
const TABLAS_APLICADAS = new Set([
  "suppliers", "purchases", "received_ecf", "received_commercial_approvals",
  "cash_register_session_ecf_items", "dgii_certification_datasets",
  "dgii_certification_applications", "petty_expenses", "foreign_payments",
]);

describe("v584 · 6 — un comprobante anulado por una nota lo dice", () => {
  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/submission-service.ts.
  it.skip("el detalle trae las notas que lo modificaron", () => {
    /**
     * Caso real de la Entrega B: `E340000000001` anuló a `E310000000001` ante la DGII, y
     * el original seguía mostrando «Aceptado por DGII» sin una sola señal. Ese estado es
     * cierto —la DGII lo aceptó— pero incompleto.
     */
    const s = soloCodigo("src/lib/dgii/submission-service.ts");
    expect(s).toContain("notasQueLoModifican");
    expect(s, "no consulta por la referencia inversa").toMatch(/reference_e_ncf\s*=/);
  });

  /**
   * v612 — Estos tres comprobaban la primera versión de la consulta y del render, y los
   * tres se quedaron cortos justo donde importaba: excluir `cancelled/rejected/error`
   * dejaba entrar notas en borrador que la DGII nunca vio; buscar `/anula|corrige/` en el
   * componente pasaba aunque el texto se lo aplicara a una nota de DÉBITO, que no anula
   * nada; y pedir un `catch` pasaba con uno mudo que se tragaba también los timeouts.
   *
   * La decisión se mudó a `lib/dgii/nota-que-modifica.ts`, donde se prueba con casos en
   * `dgii-nota-que-modifica-v612`. Acá queda lo que sigue siendo cosa de esta capa: que la
   * consulta se acote y que el componente no vuelva a decidir el texto por su cuenta.
   */
  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/submission-service.ts.
  it.skip("sólo cuenta notas que la DGII ya tiene, y acotadas", () => {
    const s = soloCodigo("src/lib/dgii/submission-service.ts");
    const i = s.indexOf("let notasQueLoModifican");
    const consulta = s.slice(i, i + 1600);
    expect(consulta, "entran notas que nunca se enviaron").toMatch(
      /IN \('submitted', 'in_process', 'accepted', 'accepted_conditional'\)/,
    );
    expect(consulta, "sin filtro de ambiente, una simulación se pega a la factura real").toMatch(/ambiente =/);
    expect(consulta, "sin tope").toMatch(/LIMIT/);
  });

  // PENDIENTE fase 6 (pantallas y rutas API): revive cuando exista src/app/(dashboard)/settings/dgii/facturas/_components/InvoicesPanel.tsx.
  it.skip("la pantalla lo enseña, y el texto lo decide el módulo, no el JSX", () => {
    const c = soloCodigo("src/app/(dashboard)/settings/dgii/facturas/_components/InvoicesPanel.tsx");
    expect(c).toContain("notasQueLoModifican");
    expect(c, "el componente vuelve a decidir la conclusión fiscal").toContain("describirNotaQueModifica");
  });

  // PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista src/features/dgii/core/submission-service.ts.
  it.skip("si la columna no existe no se afirma nada, pero un fallo de verdad se dice", () => {
    // `reference_e_ncf` puede faltar en otro entorno: eso es silencio legítimo. Un timeout
    // o un error de permisos, no: callarlo enseña como limpio un comprobante ya anulado.
    const s = leer("src/lib/dgii/submission-service.ts");
    const i = s.indexOf("let notasQueLoModifican");
    const bloque = s.slice(i, i + 2600);
    expect(bloque).toMatch(/catch \(e\)/);
    expect(bloque, "no distingue columna ausente de fallo real").toMatch(/columnaAusente/);
    expect(bloque, "el fallo no llega a la pantalla").toMatch(/notasSinComprobar = true/);
  });
});
