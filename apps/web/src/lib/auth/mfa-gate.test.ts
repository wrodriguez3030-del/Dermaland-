import { describe, it, expect } from "vitest";
import {
  accionDelDesafio,
  mfaGateDecision,
  nivelAal,
  nivelSiguienteConFactores,
  requiere2fa,
  tieneFactorVerificado,
  type DecisionMfa,
  type NivelAal,
} from "./mfa-gate";

/**
 * Esta función decide si los DOS únicos administradores del sistema entran o
 * no. No hay un tercero de reserva. Por eso se prueba la tabla entera —los tres
 * estados de garantía por rol, el fallo del chequeo y el rol ausente— y no una
 * muestra: el caso que no esté aquí es el que deja a alguien fuera.
 */

const admin = { role: "admin" as const };
const cajero = { role: "cashier" as const };

describe("mfaGateDecision — admin", () => {
  it("obliga a enrolarse si no tiene ningún factor", () => {
    // nextLevel 'aal1' significa que no hay factor verificado.
    expect(
      mfaGateDecision({ ...admin, currentLevel: "aal1", nextLevel: "aal1", chequeoFallo: false }),
    ).toBe("enrolar");
  });

  it("pide el desafío si tiene factor pero la sesión sigue en aal1", () => {
    expect(
      mfaGateDecision({ ...admin, currentLevel: "aal1", nextLevel: "aal2", chequeoFallo: false }),
    ).toBe("desafiar");
  });

  it("deja pasar cuando ya completó el segundo factor", () => {
    expect(
      mfaGateDecision({ ...admin, currentLevel: "aal2", nextLevel: "aal2", chequeoFallo: false }),
    ).toBe("permitir");
  });

  it("niega el paso si el chequeo falla: fail-closed para admin", () => {
    expect(
      mfaGateDecision({ ...admin, currentLevel: null, nextLevel: null, chequeoFallo: true }),
    ).toBe("enrolar");
  });

  it("si el chequeo falla pero consta que TIENE factor, lo manda al desafío y no a enrolarse", () => {
    // Mandarlo a `/perfil/seguridad` sería enseñarle una página que dice "2FA
    // activa" y ninguna forma de avanzar. El desafío sí tiene salida: lo
    // completa y entra.
    expect(
      mfaGateDecision({ ...admin, currentLevel: null, nextLevel: "aal2", chequeoFallo: true }),
    ).toBe("desafiar");
  });
});

describe("mfaGateDecision — roles no admin", () => {
  it("no obliga a un cajero sin factor", () => {
    expect(
      mfaGateDecision({ ...cajero, currentLevel: "aal1", nextLevel: "aal1", chequeoFallo: false }),
    ).toBe("permitir");
  });

  it("sigue pidiendo el desafío a un cajero que SÍ activó 2FA", () => {
    // 2FA es opcional para él, pero si lo activó hay que exigirlo.
    expect(
      mfaGateDecision({ ...cajero, currentLevel: "aal1", nextLevel: "aal2", chequeoFallo: false }),
    ).toBe("desafiar");
  });

  it("deja pasar al cajero que ya completó el desafío", () => {
    expect(
      mfaGateDecision({ ...cajero, currentLevel: "aal2", nextLevel: "aal2", chequeoFallo: false }),
    ).toBe("permitir");
  });

  it("mantiene el fail-open para no admin: un fallo del chequeo no los bloquea", () => {
    expect(
      mfaGateDecision({ ...cajero, currentLevel: null, nextLevel: null, chequeoFallo: true }),
    ).toBe("permitir");
  });

  it("el fail-open del cajero vale incluso si tiene factor: el turno no se detiene", () => {
    expect(
      mfaGateDecision({ ...cajero, currentLevel: "aal1", nextLevel: "aal2", chequeoFallo: true }),
    ).toBe("permitir");
  });

  it("trata un rol ausente como no admin", () => {
    expect(
      mfaGateDecision({ role: undefined, currentLevel: "aal1", nextLevel: "aal1", chequeoFallo: false }),
    ).toBe("permitir");
  });

  it("trata un rol desconocido como no admin", () => {
    for (const role of ["manager", "inventory", "supervisor", "auditor", "vendedor", "", "  ", "cliente"]) {
      expect(
        mfaGateDecision({ role, currentLevel: "aal1", nextLevel: "aal1", chequeoFallo: false }),
      ).toBe("permitir");
    }
  });
});

describe("mfaGateDecision — súper admin", () => {
  it("obliga también al rol super_admin", () => {
    expect(
      mfaGateDecision({ role: "super_admin", currentLevel: "aal1", nextLevel: "aal1", chequeoFallo: false }),
    ).toBe("enrolar");
  });

  it("obliga a is_platform_admin aunque el rol no sea de administrador", () => {
    // Cruza todos los negocios: saltarse la puerta con otro rol la anularía.
    expect(
      mfaGateDecision({
        role: "cashier",
        isPlatformAdmin: true,
        currentLevel: "aal1",
        nextLevel: "aal1",
        chequeoFallo: false,
      }),
    ).toBe("enrolar");
  });
});

/**
 * Tabla completa rol × (currentLevel, nextLevel). Si mañana alguien toca la
 * función, esto dice exactamente qué cambió y para quién.
 */
describe("mfaGateDecision — tabla exhaustiva sin fallo de chequeo", () => {
  const casos: ReadonlyArray<{
    currentLevel: NivelAal;
    nextLevel: NivelAal;
    obligado: DecisionMfa;
    opcional: DecisionMfa;
    situacion: string;
  }> = [
    { situacion: "sin factor verificado", currentLevel: "aal1", nextLevel: "aal1", obligado: "enrolar", opcional: "permitir" },
    { situacion: "con factor, sesión sin desafío", currentLevel: "aal1", nextLevel: "aal2", obligado: "desafiar", opcional: "desafiar" },
    { situacion: "con factor, desafío superado", currentLevel: "aal2", nextLevel: "aal2", obligado: "permitir", opcional: "permitir" },
  ];

  it.each(casos)("$situacion → admin: $obligado · cajero: $opcional", (c) => {
    expect(
      mfaGateDecision({ role: "admin", currentLevel: c.currentLevel, nextLevel: c.nextLevel, chequeoFallo: false }),
    ).toBe(c.obligado);
    expect(
      mfaGateDecision({ role: "cashier", currentLevel: c.currentLevel, nextLevel: c.nextLevel, chequeoFallo: false }),
    ).toBe(c.opcional);
  });

  it("nunca devuelve 'enrolar' a quien no está obligado, pase lo que pase", () => {
    const niveles: NivelAal[] = ["aal1", "aal2", null, undefined];
    for (const currentLevel of niveles) {
      for (const nextLevel of niveles) {
        for (const chequeoFallo of [true, false]) {
          expect(
            mfaGateDecision({ role: "cashier", currentLevel, nextLevel, chequeoFallo }),
          ).not.toBe("enrolar");
        }
      }
    }
  });

  it("nunca deja pasar a un obligado que no completó el segundo factor", () => {
    const niveles: NivelAal[] = ["aal1", null, undefined];
    for (const currentLevel of niveles) {
      for (const nextLevel of ["aal1", "aal2", null, undefined] as NivelAal[]) {
        for (const chequeoFallo of [true, false]) {
          expect(
            mfaGateDecision({ role: "admin", currentLevel, nextLevel, chequeoFallo }),
          ).not.toBe("permitir");
        }
      }
    }
  });
});

describe("requiere2fa", () => {
  it("obliga a admin y super_admin", () => {
    expect(requiere2fa({ role: "admin" })).toBe(true);
    expect(requiere2fa({ role: "super_admin" })).toBe(true);
  });

  it("no obliga al resto de roles ni al rol ausente", () => {
    for (const role of ["cashier", "manager", "inventory", "supervisor", "auditor", "vendedor"]) {
      expect(requiere2fa({ role })).toBe(false);
    }
    expect(requiere2fa({})).toBe(false);
    expect(requiere2fa({ role: null })).toBe(false);
    expect(requiere2fa({ role: undefined })).toBe(false);
  });

  it("una discrepancia de mayúsculas o espacios no saca a nadie de la obligación", () => {
    expect(requiere2fa({ role: "Admin" })).toBe(true);
    expect(requiere2fa({ role: " ADMIN " })).toBe(true);
    expect(requiere2fa({ role: "Super_Admin" })).toBe(true);
  });

  it("is_platform_admin obliga sólo si es el booleano real (SEC-001)", () => {
    expect(requiere2fa({ role: "cashier", isPlatformAdmin: true })).toBe(true);
    expect(requiere2fa({ role: "cashier", isPlatformAdmin: false })).toBe(false);
    // Un "true" de texto no es el claim: no debe cambiar la decisión.
    expect(requiere2fa({ role: "cashier", isPlatformAdmin: "true" as unknown as boolean })).toBe(false);
  });
});

describe("nivelAal", () => {
  it("reconoce los dos niveles conocidos", () => {
    expect(nivelAal("aal1")).toBe("aal1");
    expect(nivelAal("aal2")).toBe("aal2");
  });

  it("un nivel que no reconocemos es indeterminado, no 'aal1'", () => {
    // El tipo de Supabase es una unión ABIERTA. Dar por débil una sesión que
    // quizá sea más fuerte mandaría a enrolarse a quien ya cumplió.
    for (const raro of ["aal3", "AAL2", "", null, undefined, 2, {}]) {
      expect(nivelAal(raro)).toBe(null);
    }
  });
});

const TOTP_OK = { status: "verified", factor_type: "totp" };

describe("tieneFactorVerificado", () => {
  it("sólo cuenta los factores verificados", () => {
    expect(tieneFactorVerificado([TOTP_OK])).toBe(true);
    expect(tieneFactorVerificado([{ status: "unverified", factor_type: "totp" }, TOTP_OK])).toBe(true);
    // Un enrolamiento abandonado a medias no es un factor: si contara, el
    // middleware mandaría al desafío a quien no tiene nada que verificar.
    expect(tieneFactorVerificado([{ status: "unverified", factor_type: "totp" }])).toBe(false);
  });

  it("sólo cuenta TOTP: es lo único que la página del desafío sabe verificar", () => {
    // `listFactors()` reparte por tipo y `/login/mfa` lee SÓLO el cubo `totp`.
    // Si aquí contáramos un `phone` o un `webauthn`, el middleware diría
    // "desafía" y la página diría "no hay nada que verificar": bucle.
    expect(tieneFactorVerificado([{ status: "verified", factor_type: "phone" }])).toBe(false);
    expect(tieneFactorVerificado([{ status: "verified", factor_type: "webauthn" }])).toBe(false);
    // Y con los dos, manda el TOTP.
    expect(tieneFactorVerificado([{ status: "verified", factor_type: "phone" }, TOTP_OK])).toBe(true);
  });

  it("la ausencia de lista se lee como 'ninguno', igual que listFactors()", () => {
    // `listFactors()` hace `user?.factors ?? []`. Si aquí se leyera distinto,
    // navegador y middleware se mandarían el uno al otro sin parar.
    expect(tieneFactorVerificado(undefined)).toBe(false);
    expect(tieneFactorVerificado(null)).toBe(false);
    expect(tieneFactorVerificado([])).toBe(false);
  });

  it("aguanta una lista con huecos o formas inesperadas", () => {
    expect(tieneFactorVerificado([null, undefined])).toBe(false);
    expect(tieneFactorVerificado([{}, { status: null }])).toBe(false);
    // Sin tipo no se puede afirmar que sea TOTP.
    expect(tieneFactorVerificado([{ status: "verified" }])).toBe(false);
  });
});

/**
 * La página del desafío. Lo que se prueba aquí no es cosmética: cada una de
 * estas respuestas provocaba, con el salto automático que tenía la página, un
 * ping-pong infinito contra la puerta de 2FA.
 */
describe("accionDelDesafio", () => {
  type FactorTotp = { id?: string | null; status?: string | null };
  const listado = (totp: ReadonlyArray<FactorTotp | null | undefined>) => ({
    data: { totp },
    error: null,
  });

  it("con un TOTP verificado, pide el código", () => {
    expect(accionDelDesafio(listado([{ id: "f-1", status: "verified" }]))).toEqual({
      accion: "pedir-codigo",
      factorId: "f-1",
    });
  });

  it("con el cubo TOTP vacío, no hay nada que verificar", () => {
    // Aquí cae el usuario con un factor `phone` o `webauthn`: `listFactors()`
    // lo pone en OTRO cubo, así que el cubo `totp` llega vacío.
    expect(accionDelDesafio(listado([]))).toEqual({ accion: "sin-factor" });
    expect(accionDelDesafio({ data: {}, error: null })).toEqual({ accion: "sin-factor" });
    expect(accionDelDesafio({ data: { totp: null }, error: null })).toEqual({ accion: "sin-factor" });
  });

  it("un fallo NO es 'no tiene factor'", () => {
    // `listFactors()` devuelve `{ data: null, error }` ante cualquier fallo de
    // `getUser()`: red, un 5xx de GoTrue, una carrera del refresco entre
    // pestañas. Confundirlo con "no tiene" dejaba dando vueltas a alguien con
    // un TOTP perfectamente normal.
    expect(accionDelDesafio({ data: null, error: new Error("network") })).toEqual({
      accion: "no-se-pudo-comprobar",
    });
    expect(accionDelDesafio({ data: null, error: null })).toEqual({ accion: "no-se-pudo-comprobar" });
    expect(accionDelDesafio(null)).toEqual({ accion: "no-se-pudo-comprobar" });
    expect(accionDelDesafio(undefined)).toEqual({ accion: "no-se-pudo-comprobar" });
  });

  it("no pide código con un factor sin id utilizable", () => {
    expect(accionDelDesafio(listado([{ status: "verified" }]))).toEqual({ accion: "sin-factor" });
    expect(accionDelDesafio(listado([{ id: "", status: "verified" }]))).toEqual({ accion: "sin-factor" });
    expect(accionDelDesafio(listado([null, undefined]))).toEqual({ accion: "sin-factor" });
  });

  it("NINGUNA respuesta posible produce una navegación automática", () => {
    // Ésta es la propiedad que mata la clase entera de bucle. Si mañana alguien
    // añade una acción que navega sola, esta prueba se lo dice.
    const respuestas = [
      null, undefined,
      { data: null, error: new Error("x") },
      { data: {}, error: null },
      listado([]),
      listado([{ id: "f-1", status: "verified" }]),
      listado([{ id: "f-2", status: "unverified" }]),
    ];
    for (const r of respuestas) {
      expect(["pedir-codigo", "sin-factor", "no-se-pudo-comprobar"]).toContain(
        accionDelDesafio(r).accion,
      );
    }
  });
});

describe("nivelSiguienteConFactores", () => {
  it("sube a aal2 cuando el servidor confirma un factor verificado", () => {
    // Caso real: enroló en el teléfono; la galleta de la laptop es anterior y
    // todavía dice aal1.
    expect(nivelSiguienteConFactores("aal1", { factors: [TOTP_OK] })).toBe("aal2");
  });

  it("un factor verificado que NO es TOTP no sube el nivel", () => {
    // La página del desafío no sabría qué verificar: mandarlo allí sería
    // mandarlo a rebotar. Con "aal1" cae en "enrolar", llega a
    // `/perfil/seguridad` —exenta— y puede enrolar un TOTP de verdad.
    expect(
      nivelSiguienteConFactores("aal2", { factors: [{ status: "verified", factor_type: "webauthn" }] }),
    ).toBe("aal1");
  });

  it("BAJA a aal1 cuando el servidor dice que ya no hay factor", () => {
    // Caso break-glass: se le retiró el factor, pero su galleta sigue
    // anunciándolo. Sin esta bajada, la puerta lo mandaría eternamente a un
    // desafío que ya no existe.
    expect(nivelSiguienteConFactores("aal2", { factors: [] })).toBe("aal1");
    expect(nivelSiguienteConFactores("aal2", { factors: undefined })).toBe("aal1");
    expect(nivelSiguienteConFactores("aal2", {})).toBe("aal1");
  });

  it("un enrolamiento sin verificar no cuenta como factor", () => {
    const aMedias = [{ status: "unverified", factor_type: "totp" }];
    expect(nivelSiguienteConFactores("aal1", { factors: aMedias })).toBe("aal1");
    expect(nivelSiguienteConFactores("aal2", { factors: aMedias })).toBe("aal1");
  });

  it("sin lectura fresca del usuario, se queda con lo que diga la sesión", () => {
    expect(nivelSiguienteConFactores("aal2", null)).toBe("aal2");
    expect(nivelSiguienteConFactores("aal1", undefined)).toBe("aal1");
    expect(nivelSiguienteConFactores(null, null)).toBe(null);
  });
});
