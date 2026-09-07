import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * 🔴 Una factura emitida queda CONGELADA con el tipo que tenía ese día.
 *
 * Exigencia del dueño (08/09/2026): «al seleccionar el tipo de facturación se
 * debe facturar desde ahí con ese tipo; si cambio el tipo no afecta las ya
 * facturadas, se debe dejar fija».
 *
 * Eso ya se cumple porque cada proforma guarda SU copia (`billing_type`,
 * `document_kind`, `ecf_type`, `sequence_type`, `sequence_environment`) al
 * CREARSE, y el `update` no las toca. Pero es una propiedad frágil: basta con
 * que alguien añada uno de esos campos al `update` para que cambiar un ajuste
 * de hoy reescriba comprobantes de ayer — y eso, en fiscal, es falsear.
 *
 * Este guardián existe para que ese cambio no pase inadvertido.
 */

const SALES = path.resolve(
  import.meta.dirname,
  "../../server/repositories/supabase/sales.ts",
);

/** Campos que son una FOTO del momento de emitir y no se pueden reescribir. */
const CONGELADOS = [
  "billing_type",
  "document_kind",
  "ecf_type",
  "sequence_type",
  "sequence_environment",
  "ecf_number",
];

/** El cuerpo del método `update` del repositorio, sin comentarios. */
function cuerpoDelUpdate(): string {
  const codigo = readFileSync(SALES, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const inicio = codigo.indexOf("async update(");
  expect(inicio, "no se encontró `async update(` en el repositorio").toBeGreaterThan(-1);
  // Hasta el siguiente método del objeto: `\n  async nombre(`.
  const resto = codigo.slice(inicio + 1);
  const siguiente = resto.search(/\n {2}async [a-zA-Z]+\(/);
  return siguiente === -1 ? resto : resto.slice(0, siguiente);
}

describe("una factura emitida no cambia de tipo cuando cambia la configuración", () => {
  it("🔴 el `update` de ventas NO escribe ninguno de los campos congelados", () => {
    const cuerpo = cuerpoDelUpdate();
    // Suelo contra la prueba vacía: si el recorte fallara y `cuerpo` viniera
    // vacío, el bucle de abajo pasaría sin haber mirado nada.
    expect(cuerpo.length, "el cuerpo del `update` salió vacío").toBeGreaterThan(200);

    const culpables = CONGELADOS.filter((campo) =>
      new RegExp(`\\b${campo}\\s*:`).test(cuerpo),
    );
    expect(
      culpables,
      `estos campos son la foto del momento de emitir y el \`update\` los estaría reescribiendo: ${culpables.join(", ")}`,
    ).toEqual([]);
  });

  it("🔴 el `create` SÍ los escribe: la foto se toma al emitir", () => {
    // La otra mitad de la regla. Si el `create` dejara de guardarlos, la factura
    // no tendría tipo propio y habría que ir a buscarlo a la configuración
    // ACTUAL — que es justo lo que no puede pasar.
    const codigo = readFileSync(SALES, "utf8");
    // La fila se arma en `const proformaRow = {...}` dentro de `create`; se
    // busca ese literal en vez de contar caracteres desde el nombre del método,
    // que se desplaza en cuanto alguien añade tres líneas de comentario.
    const inicio = codigo.indexOf("const proformaRow = {");
    expect(inicio, "no se encontró `const proformaRow = {`").toBeGreaterThan(-1);
    const cierre = codigo.indexOf("\n    };", inicio);
    expect(cierre, "no se encontró el cierre de `proformaRow`").toBeGreaterThan(inicio);
    const create = codigo.slice(inicio, cierre);
    for (const campo of CONGELADOS) {
      expect(new RegExp(`\\b${campo}\\s*:`).test(create), `falta \`${campo}\` al crear`).toBe(true);
    }
  });
});
