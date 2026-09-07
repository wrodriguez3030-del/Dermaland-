import { describe, it, expect } from "vitest";
import { consultaVinculacion } from "../../../../scripts/lib/vincular-vendedores-consulta.mjs";

/**
 * 🔴 El ensayo del guion de vendedores tiene que enseñar lo que el `--apply`
 * va a escribir.
 *
 * Es el ÚNICO paso manual del despliegue de esta rama, y al dueño se le dio la
 * instrucción de correrlo sin `--apply`, mirarlo, y solo entonces aplicarlo.
 * Con el predicado `seller_id is distinct from $2` y `$2 = NULL` —el caso de
 * Desteny, Laura y «Oficina», que aún no existen como usuarios— el ensayo
 * informaba «0 facturas» para los tres, y el `--apply` escribía después ~14 743
 * filas que nunca anunció. Un ensayo que dice «esto no hace nada» es peor que
 * no tener ensayo.
 */

/** Una fila mínima de `alegra_invoices` para el evaluador. */
interface Fila {
  business_id: string;
  seller_id: string | null;
  seller_name: string | null;
}

const NEGOCIO = "00000000-0000-0000-0000-00000000d001";
const ID_NUEVO = "11111111-1111-1111-1111-111111111111";

/**
 * Evalúa el `where` generado contra una tabla en memoria.
 *
 * Solo entiende los átomos que el generador puede emitir; cualquier otro
 * REVIENTA. Es a propósito: un predicado nuevo sin evaluador es un predicado
 * sin probar, y esta prueba existe justo porque un predicado sutil (`is
 * distinct from NULL`) pasó desapercibido.
 */
function cuenta(filas: Fila[], where: string, args: (string | null)[]): number {
  const atomos = where.split(" and ");
  const param = (marca: string): string | null => {
    const indice = Number(marca.slice(1)) - 1;
    const v = args[indice];
    return v === undefined ? null : v;
  };
  return filas.filter((f) =>
    atomos.every((atomo) => {
      if (atomo === "business_id = $1") return f.business_id === args[0];
      if (atomo === "(seller_name is null or trim(seller_name) = '')") {
        return f.seller_name === null || f.seller_name.trim() === "";
      }
      const distinto = /^seller_id is distinct from (\$\d+)$/.exec(atomo);
      // `is distinct from` trata NULL como un valor más: NULL vs NULL es
      // «igual» (falso), NULL vs un id es «distinto» (cierto). `!==` en JS con
      // `null` se comporta igual.
      if (distinto) return f.seller_id !== param(distinto[1]!);
      const nombre = /^upper\(trim\(seller_name\)\) = upper\((\$\d+)\)$/.exec(atomo);
      // En SQL, `NULL = 'X'` es NULL → la fila NO pasa el filtro.
      if (nombre) {
        const buscado = param(nombre[1]!);
        return f.seller_name !== null && buscado !== null
          && f.seller_name.trim().toUpperCase() === buscado.toUpperCase();
      }
      throw new Error(`átomo SQL sin evaluador: ${atomo}`);
    }),
  ).length;
}

/** Las 5 513 de Desteny, en pequeño: sin vendedor atado, con su nombre. */
const tabla: Fila[] = [
  { business_id: NEGOCIO, seller_id: null, seller_name: "DESTENY REYNOSO" },
  { business_id: NEGOCIO, seller_id: null, seller_name: " desteny reynoso " },
  { business_id: NEGOCIO, seller_id: null, seller_name: "LAURA MEJIA" },
  { business_id: NEGOCIO, seller_id: null, seller_name: null },
  { business_id: NEGOCIO, seller_id: null, seller_name: "   " },
  { business_id: "otro-negocio", seller_id: null, seller_name: "DESTENY REYNOSO" },
];

const ensayo = (nombreAlegra: string | null) =>
  consultaVinculacion({ businessId: NEGOCIO, nombreAlegra, sellerId: null });
const aplicacion = (nombreAlegra: string | null) =>
  consultaVinculacion({ businessId: NEGOCIO, nombreAlegra, sellerId: ID_NUEVO });

describe("vincular-vendedores: el ensayo cuenta lo que el --apply escribe", () => {
  it("🔴 un vendedor que aún no existe: ensayo y aplicación dan el MISMO número", () => {
    // Esta es la que muere si vuelve el `seller_id is distinct from $2` con
    // `$2 = NULL`: el ensayo daría 0 y la aplicación 2.
    const e = ensayo("DESTENY REYNOSO");
    const a = aplicacion("DESTENY REYNOSO");
    expect(cuenta(tabla, e.where, e.args)).toBe(2);
    expect(cuenta(tabla, e.where, e.args)).toBe(cuenta(tabla, a.where, a.args));
  });

  it("🔴 y lo mismo para «Oficina», el grupo sin vendedor (8 197 facturas reales)", () => {
    const e = ensayo(null);
    const a = aplicacion(null);
    expect(cuenta(tabla, e.where, e.args)).toBe(2);
    expect(cuenta(tabla, e.where, e.args)).toBe(cuenta(tabla, a.where, a.args));
  });

  it("🔴 sin id no se compara contra NULL: el predicado se cae entero", () => {
    const e = ensayo("DESTENY REYNOSO");
    expect(e.where).not.toContain("is distinct from");
    expect(e.paramSeller).toBeNull();
    // Y los parámetros se renumeran: `pg` rechaza un `$2` que nadie usa.
    expect(e.args).toEqual([NEGOCIO, "DESTENY REYNOSO"]);
  });

  it("con id sí se compara, y el $ del seller es el que usa el update", () => {
    const a = aplicacion("DESTENY REYNOSO");
    expect(a.where).toContain("seller_id is distinct from $2");
    expect(a.paramSeller).toBe("$2");
    expect(a.args).toEqual([NEGOCIO, ID_NUEVO, "DESTENY REYNOSO"]);
    // El update escribe `set seller_id = $2`: si el placeholder dejara de ser
    // el del vendedor, el guion ataría las facturas al id equivocado.
    expect(a.args[Number(a.paramSeller!.slice(1)) - 1]).toBe(ID_NUEVO);
  });

  it("una factura ya atada a ese vendedor no vuelve a escribirse", () => {
    const atada: Fila[] = [{ business_id: NEGOCIO, seller_id: ID_NUEVO, seller_name: "DESTENY REYNOSO" }];
    const a = aplicacion("DESTENY REYNOSO");
    expect(cuenta(atada, a.where, a.args)).toBe(0);
  });

  it("🔴 nunca sale del negocio: `business_id` va en el predicado siempre", () => {
    for (const c of [ensayo("DESTENY REYNOSO"), aplicacion(null)]) {
      expect(c.where).toContain("business_id = $1");
      expect(c.args[0]).toBe(NEGOCIO);
    }
    // La fila de «otro-negocio» tiene el mismo nombre y no la cuenta ninguna.
    const e = ensayo("DESTENY REYNOSO");
    expect(cuenta(tabla, e.where, e.args)).toBe(2);
  });
});
