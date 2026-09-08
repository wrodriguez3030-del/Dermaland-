import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { idDeLaBase } from "./uuid-schema";

/**
 * 🔴 El fallo que esto cierra, y se vio como un parpadeo.
 *
 * `z.string().uuid()` exige un uuid RFC 4122 (con versión y variante válidas).
 * Postgres NO: acepta cualquier grupo de 32 hexadecimales con guiones. Y esta
 * base tiene identificadores así, puestos por las semillas: la sucursal
 * «DermaLand Principal» es `00000000-0000-0000-0000-00000000b001`.
 *
 * Nueve rutas validaban con `.uuid()`. El panel cargaba ANTES de que llegaran
 * las sucursales —sin filtro, y funcionaba—, y en cuanto llegaban, la petición
 * con ese id se rechazaba con un 400: las tarjetas pasaban a «—». «Aparece y se
 * va». Y `/api/ventas` tenía el mismo fallo: filtrar por sucursal devolvía 400
 * en silencio.
 */
describe("identificadores de la base", () => {
  it("🔴 acepta los ids de las semillas, que Postgres sí acepta", () => {
    for (const id of [
      "00000000-0000-0000-0000-00000000b001", // sucursal Principal
      "00000000-0000-0000-0000-00000000d001", // el negocio
      "0a1fd664-ea36-4df0-8634-902eb293a021", // uno generado normal
    ]) {
      expect(idDeLaBase.safeParse(id).success, `rechazó ${id}`).toBe(true);
    }
  });

  it("sigue rechazando lo que no es un identificador", () => {
    for (const malo of ["", "abc", "12345", "no-es-uuid", "00000000-0000-0000-0000-00000000b00", "'; drop table users;--"]) {
      expect(idDeLaBase.safeParse(malo).success, `aceptó ${malo}`).toBe(false);
    }
  });

  it("🔴 ninguna ruta valida identificadores más estricto que la base", () => {
    // Un guardián que DESCUBRE: validar más estricto que Postgres no protege de
    // nada, rechaza datos que la base sí tiene. Y falla de la peor manera —un
    // 400 que la pantalla enseña como un hueco.
    const raiz = resolve(process.cwd(), "src/app/api");
    const rutas: string[] = [];
    const recorrer = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const r = join(dir, e.name);
        if (e.isDirectory()) recorrer(r);
        else if (e.name === "route.ts") rutas.push(r);
      }
    };
    recorrer(raiz);
    expect(rutas.length, "no se encontraron rutas").toBeGreaterThan(20);

    const culpables = rutas.filter((r) => readFileSync(r, "utf8").includes(".uuid()"));
    expect(
      culpables.map((r) => r.slice(raiz.length)),
      "estas rutas usan .uuid(), que rechaza ids que Postgres acepta; usa `idDeLaBase`",
    ).toEqual([]);
  });
});
