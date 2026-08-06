import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La puerta de 2FA, cableada de verdad.
 *
 * `mfa-gate.test.ts` prueba la DECISIÓN; esto prueba el CABLE: que el destino
 * de cada redirección esté exento de la propia puerta (sin eso, enrolarse es un
 * bucle infinito), que la exención no se cuele en rutas que sólo empiezan
 * igual, y que un fallo del chequeo cierre la puerta al administrador sin
 * cerrársela al cajero.
 *
 * Son 2 administradores y ningún tercero: aquí no hay margen para suponer.
 */

const supabaseFalso = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  aal: null as unknown,
  aalLanza: false,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: supabaseFalso.user } }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => {
          if (supabaseFalso.aalLanza) throw new Error("chequeo caído");
          return supabaseFalso.aal;
        },
      },
    },
  }),
}));

import { NextRequest } from "next/server";
import { middleware } from "./middleware";

const NEGOCIO = "00000000-0000-0000-0000-00000000d001";

function usuario(role: string, extra: Record<string, unknown> = {}) {
  return { app_metadata: { business_id: NEGOCIO, role, ...extra } };
}

/** Estado que devuelve el chequeo de niveles cuando todo va bien. */
function niveles(currentLevel: string | null, nextLevel: string | null) {
  return { data: { currentLevel, nextLevel, currentAuthenticationMethods: [] }, error: null };
}

async function pedir(pathname: string) {
  const res = await middleware(
    new NextRequest(new URL(`https://dermaland.vercel.app${pathname}`)),
  );
  return { status: res.status, destino: res.headers.get("location") };
}

/** Ruta a la que redirige, o `null` si la petición pasó. */
async function destinoDe(pathname: string): Promise<string | null> {
  const { destino } = await pedir(pathname);
  if (!destino) return null;
  const u = new URL(destino);
  return `${u.pathname}${u.search}`;
}

beforeEach(() => {
  process.env.DATA_SOURCE = "supabase";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proyecto.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-de-mentira";
  supabaseFalso.user = null;
  supabaseFalso.aal = niveles("aal1", "aal1");
  supabaseFalso.aalLanza = false;
});

describe("puerta 2FA — administrador", () => {
  beforeEach(() => {
    supabaseFalso.user = usuario("admin");
  });

  it("sin ningún factor, lo manda a enrolarse guardando a dónde iba", async () => {
    // El defecto que arregla esta tarea: antes ESTE administrador pasaba, y 2FA
    // no protegía a nadie.
    expect(await destinoDe("/ventas")).toBe("/perfil/seguridad?next=%2Fventas");
  });

  it("con factor pero sin desafío completado, lo manda al desafío", async () => {
    supabaseFalso.aal = niveles("aal1", "aal2");
    expect(await destinoDe("/ventas")).toBe("/login/mfa?next=%2Fventas");
  });

  it("con el desafío completado, pasa", async () => {
    supabaseFalso.aal = niveles("aal2", "aal2");
    expect(await destinoDe("/ventas")).toBe(null);
  });

  it("NO se muerde la cola: la página de enrolamiento se sirve aunque no tenga factor", async () => {
    // Sin esto, el administrador rebota entre la puerta y su destino para
    // siempre y no entra nadie.
    expect(await destinoDe("/perfil/seguridad")).toBe(null);
    expect(await destinoDe("/perfil/seguridad?next=%2Fventas")).toBe(null);
  });

  it("la exención no cubre rutas que sólo empiezan igual", async () => {
    expect(await destinoDe("/perfil")).toBe("/perfil/seguridad?next=%2Fperfil");
    expect(await destinoDe("/perfil/seguridad-falsa")).toBe(
      "/perfil/seguridad?next=%2Fperfil%2Fseguridad-falsa",
    );
  });

  it("cierra también las rutas de API, no sólo las páginas", async () => {
    // Si la API quedara abierta, la puerta sería decorativa: basta llamar al
    // endpoint directamente.
    expect(await destinoDe("/api/products")).toBe("/perfil/seguridad?next=%2Fapi%2Fproducts");
  });

  it("no arrastra la query de la ruta bloqueada al destino", async () => {
    expect(await destinoDe("/ventas?sucursal=7")).toBe("/perfil/seguridad?next=%2Fventas");
  });

  it("si el chequeo revienta, no pasa: fail-closed", async () => {
    supabaseFalso.aalLanza = true;
    expect(await destinoDe("/ventas")).toBe("/perfil/seguridad?next=%2Fventas");
  });

  it("si el chequeo devuelve niveles nulos sin error, tampoco pasa", async () => {
    // Es lo que hace `getAuthenticatorAssuranceLevel` cuando no encuentra
    // sesión: `data` llega, con todo en nulo y `error: null`. Tomarlo por un
    // "aal1" legítimo sería dar por buena una sesión que no sabemos leer.
    supabaseFalso.aal = niveles(null, null);
    expect(await destinoDe("/ventas")).toBe("/perfil/seguridad?next=%2Fventas");
  });

  it("con el chequeo caído pero factor conocido, lo manda al desafío (que sí tiene salida)", async () => {
    supabaseFalso.aalLanza = true;
    supabaseFalso.user = { ...usuario("admin"), factors: [{ status: "verified" }] };
    expect(await destinoDe("/ventas")).toBe("/login/mfa?next=%2Fventas");
  });

  it("cree a la lista de factores fresca aunque la sesión guardada esté vieja", async () => {
    // Enroló en el teléfono; la galleta de la laptop es anterior y todavía dice
    // "sin factor". Sin esto lo mandaríamos a enrolarse a una página que le
    // dice que su 2FA ya está activa: encierro hasta el próximo refresco.
    supabaseFalso.aal = niveles("aal1", "aal1");
    supabaseFalso.user = { ...usuario("admin"), factors: [{ status: "verified" }] };
    expect(await destinoDe("/ventas")).toBe("/login/mfa?next=%2Fventas");
  });

  it("un enrolamiento abandonado sin verificar no cuenta como factor", async () => {
    // Si contara, lo mandaríamos a un desafío que no puede completar.
    supabaseFalso.user = { ...usuario("admin"), factors: [{ status: "unverified" }] };
    expect(await destinoDe("/ventas")).toBe("/perfil/seguridad?next=%2Fventas");
  });

  it("obliga igual al súper administrador de la plataforma", async () => {
    supabaseFalso.user = usuario("cashier", { is_platform_admin: true });
    expect(await destinoDe("/super-admin")).toBe("/perfil/seguridad?next=%2Fsuper-admin");
  });

  it("no acepta el rol de `user_metadata` para librarse (SEC-001)", async () => {
    // Si el rol se leyera de donde el usuario puede escribir, cualquiera se
    // quitaría la obligación con un `auth.updateUser`.
    supabaseFalso.user = {
      app_metadata: { business_id: NEGOCIO, role: "admin" },
      user_metadata: { role: "cashier" },
    };
    expect(await destinoDe("/ventas")).toBe("/perfil/seguridad?next=%2Fventas");
  });
});

describe("puerta 2FA — cajero (2FA opcional)", () => {
  beforeEach(() => {
    supabaseFalso.user = usuario("cashier");
  });

  it("sin factor, pasa: no se le impone 2FA", async () => {
    expect(await destinoDe("/ventas")).toBe(null);
  });

  it("si SÍ activó 2FA, se le exige el desafío igual", async () => {
    supabaseFalso.aal = niveles("aal1", "aal2");
    expect(await destinoDe("/ventas")).toBe("/login/mfa?next=%2Fventas");
  });

  it("si el chequeo revienta, sigue vendiendo: fail-open", async () => {
    // Un fallo del chequeo no puede parar el POS a mitad de un turno.
    supabaseFalso.aalLanza = true;
    expect(await destinoDe("/ventas")).toBe(null);
  });

  it("un rol ausente se trata como no obligado", async () => {
    supabaseFalso.user = { app_metadata: { business_id: NEGOCIO } };
    expect(await destinoDe("/ventas")).toBe(null);
  });
});

describe("puerta 2FA — lo que sigue igual", () => {
  it("sin sesión, al login (la puerta 2FA no se adelanta)", async () => {
    supabaseFalso.user = null;
    expect(await destinoDe("/ventas")).toBe("/login?next=%2Fventas");
  });

  it("un cliente de la tienda va a la tienda, no a enrolarse", async () => {
    supabaseFalso.user = { app_metadata: {} };
    expect(await destinoDe("/ventas")).toBe("/tienda");
  });

  it("las rutas públicas no pasan por la puerta", async () => {
    supabaseFalso.user = usuario("admin");
    expect(await destinoDe("/login/mfa")).toBe(null);
    expect(await destinoDe("/tienda")).toBe(null);
    expect(await destinoDe("/api/health")).toBe(null);
  });

  it("en modo mock la puerta no existe (demos sin Supabase)", async () => {
    process.env.DATA_SOURCE = "mock";
    supabaseFalso.user = usuario("admin");
    expect(await destinoDe("/ventas")).toBe(null);
  });
});

/**
 * La prueba que de verdad importa: cualquier redirección de la puerta tiene que
 * caer en un sitio que la puerta NO vigile. Se recorre la cadena entera desde
 * cada ruta y cada estado posible y se exige que termine.
 */
describe("puerta 2FA — la cadena de redirecciones siempre termina", () => {
  const estados = [
    { nombre: "sin factor", aal: niveles("aal1", "aal1"), factors: undefined, lanza: false },
    { nombre: "con factor sin desafío", aal: niveles("aal1", "aal2"), factors: undefined, lanza: false },
    { nombre: "con desafío superado", aal: niveles("aal2", "aal2"), factors: undefined, lanza: false },
    { nombre: "chequeo caído", aal: null, factors: undefined, lanza: true },
    { nombre: "chequeo caído con factor", aal: null, factors: [{ status: "verified" }], lanza: true },
    { nombre: "niveles nulos", aal: niveles(null, null), factors: undefined, lanza: false },
  ] as const;

  const rutas = ["/", "/ventas", "/api/products", "/super-admin", "/perfil", "/perfil/seguridad", "/login/mfa"];

  for (const rol of ["admin", "super_admin", "cashier", "manager"]) {
    for (const estado of estados) {
      it(`${rol} · ${estado.nombre}`, async () => {
        supabaseFalso.aal = estado.aal;
        supabaseFalso.aalLanza = estado.lanza;
        supabaseFalso.user = estado.factors
          ? { ...usuario(rol), factors: estado.factors }
          : usuario(rol);

        for (const inicio of rutas) {
          const visitadas = new Set<string>();
          let actual: string | null = inicio;
          let saltos = 0;
          while (actual) {
            expect(visitadas.has(actual), `bucle en ${inicio}: ${[...visitadas].join(" → ")}`).toBe(false);
            visitadas.add(actual);
            actual = await destinoDe(actual);
            saltos += 1;
            expect(saltos, `demasiados saltos desde ${inicio}`).toBeLessThan(5);
          }
        }
      });
    }
  }
});
