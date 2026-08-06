import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La puerta de 2FA, cableada de verdad.
 *
 * `mfa-gate.test.ts` prueba la DECISIÓN; esto prueba el CABLE: que el destino
 * de cada redirección esté exento de la propia puerta (sin eso, enrolarse es un
 * bucle infinito), que la exención no vaya ni un milímetro más allá del destino
 * (con eso se saltaba el segundo factor entero), y que un fallo del chequeo
 * cierre la puerta al administrador sin cerrársela al cajero.
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
import { accionDelDesafio } from "@/lib/auth/mfa-gate";
import { middleware } from "./middleware";

const NEGOCIO = "00000000-0000-0000-0000-00000000d001";
const FACTOR_VERIFICADO = [{ status: "verified", factor_type: "totp" }];

function usuario(role: string, extra: Record<string, unknown> = {}) {
  return { app_metadata: { business_id: NEGOCIO, role, ...extra } };
}

/** El mismo usuario, con un factor TOTP verificado según el servidor. */
function conFactor(u: Record<string, unknown>) {
  return { ...u, factors: FACTOR_VERIFICADO };
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
    supabaseFalso.user = conFactor(usuario("admin"));
    supabaseFalso.aal = niveles("aal1", "aal2");
    expect(await destinoDe("/ventas")).toBe("/login/mfa?next=%2Fventas");
  });

  it("con el desafío completado, pasa", async () => {
    supabaseFalso.user = conFactor(usuario("admin"));
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
    supabaseFalso.user = conFactor(usuario("admin"));
    expect(await destinoDe("/ventas")).toBe("/login/mfa?next=%2Fventas");
  });

  it("cree a la lista de factores fresca aunque la sesión guardada esté vieja", async () => {
    // Enroló en el teléfono; la galleta de la laptop es anterior y todavía dice
    // "sin factor". Sin esto lo mandaríamos a enrolarse a una página que le
    // dice que su 2FA ya está activa: encierro hasta el próximo refresco.
    supabaseFalso.aal = niveles("aal1", "aal1");
    supabaseFalso.user = conFactor(usuario("admin"));
    expect(await destinoDe("/ventas")).toBe("/login/mfa?next=%2Fventas");
  });

  it("cree a la lista fresca también cuando dice que YA NO hay factor", async () => {
    // Caso break-glass: se le retiró el factor pero su galleta sigue
    // anunciándolo. Si le creyéramos a la galleta lo mandaríamos a un desafío
    // que ya no existe, y de ahí a la página de seguridad, y vuelta: bucle.
    supabaseFalso.aal = niveles("aal1", "aal2");
    supabaseFalso.user = usuario("admin"); // el servidor ya no reporta factores
    expect(await destinoDe("/ventas")).toBe("/perfil/seguridad?next=%2Fventas");
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

/**
 * El bypass que encontró la auditoría. `/perfil/seguridad` ofrece `unenroll`
 * —y `enroll` desde la consola— y la aplicación no comprobaba allí el nivel de
 * garantía: lo delegaba entero en GoTrue. Con la exención incondicional, quien
 * sólo tenía la contraseña robada entraba en aal1, iba derecho a esa página sin
 * pasar por el desafío, retiraba el factor de la víctima y enrolaba el suyo.
 */
describe("puerta 2FA — el bypass de /perfil/seguridad en aal1", () => {
  beforeEach(() => {
    // Contraseña robada: sesión en aal1. La víctima SÍ tiene 2FA enrolado.
    supabaseFalso.user = conFactor(usuario("admin"));
    supabaseFalso.aal = niveles("aal1", "aal2");
  });

  it("con factor y sesión en aal1, /perfil/seguridad manda al desafío en vez de servirse", async () => {
    expect(await destinoDe("/perfil/seguridad")).toBe(
      "/login/mfa?next=%2Fperfil%2Fseguridad",
    );
  });

  it("tampoco se cuela por un subrecurso de esa página", async () => {
    expect(await destinoDe("/perfil/seguridad/respaldo")).toBe(
      "/login/mfa?next=%2Fperfil%2Fseguridad%2Frespaldo",
    );
  });

  it("le pasa igual a un cajero con 2FA activo: el bypass no era sólo de admin", async () => {
    supabaseFalso.user = conFactor(usuario("cashier"));
    expect(await destinoDe("/perfil/seguridad")).toBe(
      "/login/mfa?next=%2Fperfil%2Fseguridad",
    );
  });

  it("superado el desafío, la página vuelve a servirse con normalidad", async () => {
    supabaseFalso.aal = niveles("aal2", "aal2");
    expect(await destinoDe("/perfil/seguridad")).toBe(null);
  });

  it("y quien NO tiene factor sigue llegando a enrolarse (no se rompió el camino)", async () => {
    supabaseFalso.user = usuario("admin");
    supabaseFalso.aal = niveles("aal1", "aal1");
    expect(await destinoDe("/perfil/seguridad")).toBe(null);
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
    supabaseFalso.user = conFactor(usuario("cashier"));
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
 * caer en un sitio que la puerta NO vigile CON ESA MISMA DECISIÓN. Se recorre
 * la cadena entera desde cada ruta y cada estado posible y se exige que
 * termine.
 *
 * El recorrido incluye el salto que hace el NAVEGADOR, no sólo los del
 * servidor: `/login/mfa` es pública, así que el middleware la sirve sin mirar,
 * pero la página se redirige sola a `/perfil/seguridad` si no encuentra ningún
 * factor verificado (`login/mfa/page.tsx`). Ese salto es justo el que podría
 * cerrar un bucle con la exención condicional, así que se modela aquí.
 */
describe("puerta 2FA — la cadena de redirecciones siempre termina", () => {
  const estados = [
    { nombre: "sin factor", aal: niveles("aal1", "aal1"), factors: null, lanza: false, listFactorsFalla: false },
    { nombre: "con factor sin desafío", aal: niveles("aal1", "aal2"), factors: FACTOR_VERIFICADO, lanza: false, listFactorsFalla: false },
    { nombre: "con desafío superado", aal: niveles("aal2", "aal2"), factors: FACTOR_VERIFICADO, lanza: false, listFactorsFalla: false },
    { nombre: "chequeo caído", aal: null, factors: null, lanza: true, listFactorsFalla: false },
    { nombre: "chequeo caído con factor", aal: null, factors: FACTOR_VERIFICADO, lanza: true, listFactorsFalla: false },
    { nombre: "niveles nulos", aal: niveles(null, null), factors: null, lanza: false, listFactorsFalla: false },
    // La galleta miente por defecto: enroló en otro dispositivo.
    { nombre: "galleta corta (enroló en otro sitio)", aal: niveles("aal1", "aal1"), factors: FACTOR_VERIFICADO, lanza: false, listFactorsFalla: false },
    // La galleta miente por exceso: le hicieron break-glass y su sesión sigue
    // anunciando un factor que ya no existe. Éste es el que crea el bucle si el
    // middleware le cree a la galleta en vez de al servidor.
    { nombre: "galleta larga (break-glass reciente)", aal: niveles("aal1", "aal2"), factors: null, lanza: false, listFactorsFalla: false },
    { nombre: "galleta larga y sesión ya en aal2", aal: niveles("aal2", "aal2"), factors: null, lanza: false, listFactorsFalla: false },
    { nombre: "enrolamiento a medias sin verificar", aal: niveles("aal1", "aal1"), factors: [{ status: "unverified", factor_type: "totp" }], lanza: false, listFactorsFalla: false },
    // Los dos que encontró la auditoría en la ronda 2.
    { nombre: "factor verificado que NO es TOTP", aal: niveles("aal1", "aal2"), factors: [{ status: "verified", factor_type: "webauthn" }], lanza: false, listFactorsFalla: false },
    { nombre: "listFactors falla con un TOTP normal", aal: niveles("aal1", "aal2"), factors: FACTOR_VERIFICADO, lanza: false, listFactorsFalla: true },
  ];

  const rutas = ["/", "/ventas", "/api/products", "/super-admin", "/perfil", "/perfil/seguridad", "/login/mfa"];

  /**
   * `listFactors()` tal y como lo construye auth-js: reparte en cubos POR TIPO
   * y sólo los verificados, y devuelve `data: null` ante cualquier fallo de
   * `getUser()` (`GoTrueClient.js:4482-4506`).
   *
   * Se simula la respuesta —no la decisión— justamente para que la decisión la
   * tome `accionDelDesafio`, que es la MISMA función que usa la página. Antes
   * esta prueba reimplementaba a mano el criterio de la página y por eso
   * heredaba su punto ciego: las dos partes no podían discrepar dentro de la
   * prueba, y el bucle vive precisamente en que discrepen.
   */
  function listFactorsSimulado(
    factors: ReadonlyArray<{ status?: string; factor_type?: string }> | null,
    falla: boolean,
  ) {
    if (falla) return { data: null, error: new Error("getUser falló") };
    const verificados = (factors ?? []).filter((f) => f.status === "verified");
    return {
      data: {
        all: factors ?? [],
        totp: verificados.filter((f) => f.factor_type === "totp").map((f, i) => ({ ...f, id: `f-${i}` })),
        phone: verificados.filter((f) => f.factor_type === "phone"),
        webauthn: verificados.filter((f) => f.factor_type === "webauthn"),
      },
      error: null,
    };
  }

  /**
   * El salto que da el NAVEGADOR en `/login/mfa`.
   *
   * `saltoAutomatico` reproduce la página ANTERIOR, que se iba sola a
   * `/perfil/seguridad` cuando no encontraba un TOTP. La de ahora no navega:
   * enseña un mensaje con un enlace. Se deja parametrizado para poder
   * demostrar, abajo, que ese clic es lo único que rompe el ciclo.
   */
  const saltoDelNavegador = (
    ruta: string,
    estado: (typeof estados)[number],
    saltoAutomatico: boolean,
  ): string | null => {
    if (ruta.split("?")[0] !== "/login/mfa") return null;
    const decision = accionDelDesafio(
      listFactorsSimulado(estado.factors, estado.listFactorsFalla),
    );
    // Con un TOTP que verificar la página se queda pidiendo el código.
    if (decision.accion === "pedir-codigo") return null;
    return saltoAutomatico
      ? `/perfil/seguridad?next=${encodeURIComponent(ruta)}`
      : null;
  };

  async function recorrer(
    estado: (typeof estados)[number],
    rol: string,
    saltoAutomatico: boolean,
  ): Promise<string | null> {
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
        if (visitadas.has(actual)) {
          return `bucle en ${inicio}: ${[...visitadas].join(" → ")} → ${actual}`;
        }
        visitadas.add(actual);
        const servidor: string | null = await destinoDe(actual);
        actual = servidor ?? saltoDelNavegador(actual, estado, saltoAutomatico);
        saltos += 1;
        if (saltos > 6) return `demasiados saltos desde ${inicio}`;
      }
    }
    return null;
  }

  for (const rol of ["admin", "super_admin", "cashier", "manager"]) {
    for (const estado of estados) {
      it(`${rol} · ${estado.nombre}`, async () => {
        expect(await recorrer(estado, rol, false)).toBe(null);
      });
    }
  }

  /**
   * Y la prueba de que el clic es lo que aguanta el peso.
   *
   * Con el salto automático de la página anterior, `listFactors()` caído deja a
   * un administrador con un TOTP perfectamente normal dando vueltas sin fin. No
   * hace falta ninguna configuración rara: basta un fallo de red en el peor
   * momento. Si alguien quita la pantalla con enlace y devuelve el salto, esta
   * prueba pasa a decir "ya no da vueltas" y falla, señalando el sitio.
   */
  it("con el salto automático de antes, un listFactors caído daba vueltas sin fin", async () => {
    const estado = estados.find((e) => e.listFactorsFalla)!;
    const problema = await recorrer(estado, "admin", true);
    expect(problema).toMatch(/^bucle en/);
    expect(problema).toContain("/login/mfa");
    expect(problema).toContain("/perfil/seguridad");
  });

  /**
   * El factor no-TOTP, en cambio, está arreglado DE RAÍZ: alineados los
   * criterios, el middleware ya no manda al desafío a quien no tiene un TOTP,
   * así que la cadena termina incluso con el salto automático puesto.
   */
  it("el factor que no es TOTP ya no da vueltas ni con el salto automático", async () => {
    const estado = estados.find((e) => e.nombre === "factor verificado que NO es TOTP")!;
    expect(await recorrer(estado, "admin", true)).toBe(null);
  });
});
