import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 🔴 `public.users` se escribe SOLO con service_role, y SIEMPRE acotado por
 * `business_id`.
 *
 * QUÉ PASÓ, PARA QUE NO VUELVA A PASAR
 * ────────────────────────────────────
 * La migración `20260909100000_cuentas_de_acceso.sql` revoca `insert/update/
 * delete` sobre `users` al rol `authenticated` — hacía falta, porque hasta
 * entonces CUALQUIER empleado del negocio podía editar CUALQUIER fila por
 * PostgREST, rol incluido, y con las cuentas de acceso eso pasaba de «engaña al
 * panel» a «me hago administrador».
 *
 * Pero el código seguía escribiendo con el cliente de la SESIÓN. En cuanto se
 * aplicó la migración, crear y editar usuarios dejó de funcionar en producción.
 * Se arregló pasando las dos rutas a `createServiceRoleClient()`.
 *
 * Y ahí aparece el peligro nuevo: service_role SE SALTA LA RLS. El
 * `.eq("business_id")` deja de ser defensa en profundidad y pasa a ser LA única
 * barrera entre negocios. Olvidarlo en un `update` no daría ningún error: haría
 * que un administrador pudiera editar la ficha de otra empresa.
 *
 * Este guardián ata las dos mitades: quien escribe `users` usa service_role, y
 * quien usa service_role sobre `users` filtra por negocio.
 */

const RUTAS = [
  "src/app/api/users/route.ts",
  "src/app/api/users/[id]/route.ts",
  // El BORRADO no vive en la ruta sino en su servicio, y es la escritura más
  // peligrosa de las tres: sin `business_id` un administrador borraría la ficha
  // de otra empresa y nada daría error.
  "src/server/services/users/borrado.ts",
];

function leer(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("las rutas de usuarios escriben como servidor y por negocio", () => {
  it("🔴 ninguna ruta que escriba `users` usa el cliente de la sesión", () => {
    for (const rel of RUTAS) {
      const texto = leer(rel);
      const escribe = /\.from\("users"\)[\s\S]{0,200}?\.(insert|update|delete)\(/.test(texto);
      if (!escribe) continue;
      expect(
        texto.includes("createServiceRoleClient"),
        `${rel} escribe en \`users\` pero no usa service_role: desde la migración 20260909100000 eso falla con «permission denied»`,
      ).toBe(true);
      // `createServer` es el cliente de la sesión. Si vuelve a aparecer aquí,
      // es que alguien deshizo el arreglo.
      expect(
        /\bcreateServer\b/.test(texto),
        `${rel} volvió a usar el cliente de la sesión (\`createServer\`)`,
      ).toBe(false);
    }
  });

  it("🔴 toda escritura de `users` lleva `business_id`", () => {
    // service_role se salta la RLS: sin este filtro, un administrador editaría
    // la ficha de otra empresa y nada daría error.
    for (const rel of RUTAS) {
      const texto = leer(rel);

      // INSERT: la fila tiene que traer `business_id` de la sesión.
      const inserta = texto.match(/\.insert\(\{[\s\S]{0,400}?\}/);
      if (inserta) {
        expect(
          /business_id:\s*session\.businessId/.test(inserta[0]),
          `${rel}: el INSERT en \`users\` no pone \`business_id\` de la sesión`,
        ).toBe(true);
      }

      // UPDATE: tiene que ir acotado por negocio.
      const actualiza = texto.match(/\.update\([\s\S]{0,300}?\.select\(/);
      if (actualiza) {
        expect(
          /\.eq\("business_id",\s*session\.businessId\)/.test(actualiza[0]),
          `${rel}: el UPDATE de \`users\` no está acotado por \`business_id\``,
        ).toBe(true);
      }

      // 🔴 DELETE: lo mismo, y aquí no hay vuelta atrás. `businessId` puede
      // llegar como variable (el servicio) o como `session.businessId` (una
      // ruta); lo que no puede es faltar.
      const borra = texto.match(/\.delete\(\)[\s\S]{0,300}/);
      if (borra) {
        expect(
          /\.eq\("business_id",\s*(session\.)?businessId\)/.test(borra[0]),
          `${rel}: el DELETE de \`users\` no está acotado por \`business_id\``,
        ).toBe(true);
      }
    }
  });

  it("el guardián está mirando archivos de verdad", () => {
    // Suelo contra la ruta mal escrita: si `leer` fallara o el archivo
    // estuviera vacío, los bucles de arriba pasarían sin comprobar nada.
    for (const rel of RUTAS) {
      expect(leer(rel).length, `${rel} salió vacío`).toBeGreaterThan(500);
    }
  });
});
