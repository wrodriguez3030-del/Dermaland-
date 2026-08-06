import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  MIN_TABLAS,
  MIN_POLITICAS,
  LEASE_MAXIMO,
  LEASE_MINIMO,
  assertOrigenDistinto,
  assertMagnitudCreible,
  calcularLease,
  esDestinoProduccion,
  esElMismoCluster,
  hostDeDestino,
} from "../../../../scripts/backup/lib/dr-guards.mjs";

/**
 * Estas dos guardas existen porque una ronda de re-revisión encontró que el
 * simulacro de recuperación podía aprobarse a sí mismo de dos maneras:
 *
 *   1. Apuntando origen y destino a la MISMA base — `diffFingerprints(prod, prod)`
 *      devuelve `ok: true` sin haber restaurado nada.
 *   2. Comparando contra una huella de producción SIMBÓLICA — no vacía (eso ya lo
 *      rechazaba `diffFingerprints`) pero de un elemento por dimensión, contra la
 *      cual "no falta nada" se cumple trivialmente.
 *
 * Sin estas pruebas las dos guardas son una afirmación, no una garantía: es
 * exactamente el mismo error que motivó el simulacro entero.
 */

/** Identidades reales medidas en el simulacro del 2026-08-05. */
const PRODUCCION = {
  sysid: "7634664568297872568",
  base: "postgres",
  inicio: "2026-07-23 11:02:44.123456+00",
  version: "17.6",
};
const ARENERO = {
  sysid: "7670730323392327720",
  base: "postgres",
  inicio: "2026-08-05 21:50:11.987654+00",
  version: "17.6",
};

describe("la comprobación de producción está CABLEADA (no fijada a false)", () => {
  // Ronda de corrección 2 (2026-08-06): `isProduction` es la rama más ruidosa
  // de `assertSafeTarget` y sus tres llamadores reales la pasaban como `false`
  // literal — sólo valía `true` en una prueba. La guarda decía proteger
  // producción sin que nadie se lo preguntara nunca. Estas pruebas fijan las
  // dos mitades: que los predicados hacen su trabajo, y que ningún llamador
  // vuelve a escribir el `false`.

  const leerScript = (rel: string) =>
    readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

  it("esElMismoCluster: true sólo cuando los system_identifier coinciden", () => {
    expect(esElMismoCluster({ origen: PRODUCCION, destino: { ...PRODUCCION } })).toBe(true);
    expect(esElMismoCluster({ origen: PRODUCCION, destino: ARENERO })).toBe(false);
  });

  it("esElMismoCluster: sin identidad devuelve false — de lanzar se encarga assertOrigenDistinto", () => {
    expect(esElMismoCluster({ origen: null, destino: ARENERO })).toBe(false);
    expect(esElMismoCluster({ origen: PRODUCCION, destino: {} })).toBe(false);
  });

  it("hostDeDestino entiende URL, DSN, usuario@host y host suelto", () => {
    expect(hostDeDestino("https://sntcvyozbhrgicwmtcoh.supabase.co")).toBe(
      "sntcvyozbhrgicwmtcoh.supabase.co",
    );
    expect(hostDeDestino("postgresql://postgres.ref:clave@aws-1-us-east-2.pooler.supabase.com:5432/postgres")).toBe(
      "aws-1-us-east-2.pooler.supabase.com",
    );
    expect(hostDeDestino("cibaocloud@supabase-01")).toBe("supabase-01");
    expect(hostDeDestino("supabase-01")).toBe("supabase-01");
    expect(hostDeDestino("  ")).toBeNull();
    expect(hostDeDestino(undefined)).toBeNull();
  });

  it("esDestinoProduccion: el mismo proyecto escrito de dos maneras sigue siendo producción", () => {
    expect(
      esDestinoProduccion({
        destino: "https://sntcvyozbhrgicwmtcoh.supabase.co",
        produccion: "https://sntcvyozbhrgicwmtcoh.supabase.co",
      }),
    ).toBe(true);
    expect(
      esDestinoProduccion({
        destino: "https://sntcvyozbhrgicwmtcoh.supabase.co",
        produccion: "sntcvyozbhrgicwmtcoh.pooler.supabase.com",
      }),
    ).toBe(true);
  });

  it("esDestinoProduccion: un proyecto DESTINO nuevo no es producción", () => {
    expect(
      esDestinoProduccion({
        destino: "https://otroproyectonuevo.supabase.co",
        produccion: "https://sntcvyozbhrgicwmtcoh.supabase.co",
      }),
    ).toBe(false);
  });

  it("esDestinoProduccion: el servidor del arenero no es el host de producción", () => {
    expect(
      esDestinoProduccion({
        destino: "cibaocloud@supabase-01",
        produccion: "aws-1-us-east-2.pooler.supabase.com",
      }),
    ).toBe(false);
    // …y si alguien apunta DR_HOST a la base de producción, sí lo es.
    expect(
      esDestinoProduccion({
        destino: "cibaocloud@aws-1-us-east-2.pooler.supabase.com",
        produccion: "aws-1-us-east-2.pooler.supabase.com",
      }),
    ).toBe(true);
  });

  it("esDestinoProduccion: dos hosts que no son de Supabase y comparten primera etiqueta NO se confunden", () => {
    // Comparar sólo la primera etiqueta fuera de Supabase daría un falso
    // positivo, y en una guarda deny-by-default eso se paga bloqueando trabajo
    // legítimo — el error que ya obligó a rehacer la huella.
    expect(esDestinoProduccion({ destino: "db.uno.example", produccion: "db.dos.example" })).toBe(false);
  });

  it("esDestinoProduccion: devuelve null (no false) cuando no se puede determinar", () => {
    expect(esDestinoProduccion({ destino: "https://x.supabase.co", produccion: "" })).toBeNull();
    expect(esDestinoProduccion({ destino: null, produccion: "https://x.supabase.co" })).toBeNull();
  });

  it("ningún llamador real vuelve a fijar isProduction en false", () => {
    for (const script of ["../../../../scripts/backup/dr-drill.mjs", "../../../../scripts/backup/restore-from-json.mjs"]) {
      expect(leerScript(script), `${script} volvió a fijar isProduction: false`).not.toMatch(
        /isProduction:\s*false/,
      );
    }
  });

  it("restore-from-json falla cerrado si no puede saber cuál es producción", () => {
    const fuente = leerScript("../../../../scripts/backup/restore-from-json.mjs");
    // El `catch { /* seguir */ }` de antes se saltaba la comprobación entera en
    // una máquina sin .env.local — justo la de un equipo de recuperación.
    expect(fuente).not.toMatch(/catch\s*\{\s*\/\*\s*\.env\.local ausente: seguir/);
    expect(fuente).toMatch(/esProduccion === null/);
    expect(fuente).toContain("DERMALAND_PROD_SUPABASE_URL");
  });
});

describe("assertOrigenDistinto", () => {
  it("acepta dos clusters distintos", () => {
    expect(() => assertOrigenDistinto({ origen: PRODUCCION, destino: ARENERO })).not.toThrow();
  });

  it("aborta si origen y destino son el MISMO cluster", () => {
    expect(() => assertOrigenDistinto({ origen: PRODUCCION, destino: { ...PRODUCCION } })).toThrow(
      /MISMO cluster/,
    );
  });

  it("no se deja engañar por un DSN escrito distinto: manda el system_identifier", () => {
    // Misma base alcanzada por el pooler y por conexión directa: el host, el
    // puerto y hasta el usuario cambian, pero el cluster es el mismo.
    const viaPooler = { ...PRODUCCION, base: "postgres" };
    const viaDirecta = { ...PRODUCCION, base: "postgres", inicio: "otra lectura del reloj" };
    expect(() => assertOrigenDistinto({ origen: viaPooler, destino: viaDirecta })).toThrow(
      /MISMO cluster/,
    );
  });

  it("compara como TEXTO: dos sysid que colisionan al pasar por Number siguen siendo distintos", () => {
    // Los system_identifier son int8 fuera del rango entero seguro de JS:
    // Number("7634664568297872568") === Number("7634664568297872569"). Si la
    // guarda comparara números, dos clusters distintos parecerían el mismo.
    const a = { sysid: "7634664568297872568" };
    const b = { sysid: "7634664568297872569" };
    expect(Number(a.sysid)).toBe(Number(b.sysid)); // la colisión es real
    expect(() => assertOrigenDistinto({ origen: a, destino: b })).not.toThrow();
  });

  it("aborta si no se pudo establecer la identidad del origen", () => {
    expect(() => assertOrigenDistinto({ origen: { sysid: null }, destino: ARENERO })).toThrow(
      /identidad del cluster de el origen/,
    );
  });

  it("aborta si no se pudo establecer la identidad del destino", () => {
    expect(() => assertOrigenDistinto({ origen: PRODUCCION, destino: {} })).toThrow(
      /identidad del cluster de el destino/,
    );
  });

  it("aborta si faltan las dos identidades", () => {
    expect(() => assertOrigenDistinto({ origen: null, destino: undefined })).toThrow(
      /identidad del cluster de origen y destino/,
    );
  });

  it("trata un sysid en blanco como ausente, no como valor válido", () => {
    // Dos cadenas vacías serían "iguales" y también "distintas de todo" según
    // cómo se mire; la única respuesta segura es abortar.
    expect(() => assertOrigenDistinto({ origen: { sysid: "   " }, destino: ARENERO })).toThrow(
      /identidad del cluster/,
    );
  });
});

/**
 * Ronda 3 de revisión: un SIGKILL al proceso local dejaba el arenero vivo con
 * `auth.users` ya restaurada —cuentas reales con sus hashes— y el respaldo
 * íntegro de producción en /tmp, en el servidor que aloja la producción de otro
 * cliente. Ni `finally` ni SIGINT/SIGTERM cubren ese caso: ninguno se ejecuta.
 * Lo cubre un vigilante en el servidor con un contrato acotado, y estas pruebas
 * clavan la única propiedad que hace que el contrato valga algo.
 */
describe("calcularLease", () => {
  it("sin variable de entorno usa el máximo", () => {
    expect(calcularLease(undefined)).toBe(LEASE_MAXIMO);
    expect(calcularLease("")).toBe(LEASE_MAXIMO);
    expect(calcularLease(null)).toBe(LEASE_MAXIMO);
  });

  it("EL ENTORNO NO PUEDE ALARGAR LA EXPOSICIÓN: se acota al máximo", () => {
    // La propiedad de seguridad entera. Si esto se rompe, una variable de
    // entorno (o un error de dedo) deja datos de producción vivos en el
    // servidor de otro cliente durante el tiempo que le dé la gana.
    expect(calcularLease(99999)).toBe(LEASE_MAXIMO);
    expect(calcularLease("86400")).toBe(LEASE_MAXIMO);
    expect(calcularLease(Number.MAX_SAFE_INTEGER)).toBe(LEASE_MAXIMO);
    expect(calcularLease(Infinity)).toBe(LEASE_MAXIMO);
  });

  it("permite acortarlo, que es para lo que existe (probar el vigilante)", () => {
    expect(calcularLease(30)).toBe(30);
    expect(calcularLease("45")).toBe(45);
  });

  it("no deja bajar del piso: un contrato demasiado corto se suicida a mitad de un paso sano", () => {
    expect(calcularLease(1)).toBe(LEASE_MINIMO);
    expect(calcularLease(29)).toBe(LEASE_MINIMO);
  });

  it("la basura no desactiva el contrato: cae al máximo, nunca a cero ni a infinito", () => {
    for (const basura of ["no", "12abc", NaN, -5, 0, {}, [], true]) {
      const v = calcularLease(basura);
      expect(v).toBeGreaterThanOrEqual(LEASE_MINIMO);
      expect(v).toBeLessThanOrEqual(LEASE_MAXIMO);
    }
  });

  it("devuelve siempre un entero: va dentro de aritmética de shell", () => {
    expect(Number.isInteger(calcularLease(42.7))).toBe(true);
    expect(calcularLease(42.7)).toBe(42);
  });

  it("los límites son coherentes entre sí", () => {
    expect(LEASE_MINIMO).toBeLessThan(LEASE_MAXIMO);
    expect(LEASE_MAXIMO).toBeLessThanOrEqual(600); // nunca más de 10 minutos
  });
});

describe("assertMagnitudCreible", () => {
  /** Construye una huella con `n` tablas y `p` políticas repartidas. */
  const huella = (n: number, p: number) => ({
    filas: Object.fromEntries(Array.from({ length: n }, (_, i) => [`tabla_${i}`, 10])),
    politicas: p > 0 ? { tabla_0: p } : {},
  });

  it("acepta la magnitud real de producción y devuelve lo que midió", () => {
    // Revisión 4 de la huella: 98 tablas rastreadas (83 en public + 10 durables
    // de auth + 5 durables de storage) y 106 políticas (101 en public + 5 en
    // storage.objects).
    expect(assertMagnitudCreible(huella(98, 106))).toEqual({ tablas: 98, politicas: 106 });
  });

  it("sigue aceptando la magnitud de la revisión 3 (86 tablas): el piso no se subió", () => {
    // Deliberado: el piso rechaza huellas DEGENERADAS, no hace de cable trampa
    // fino. De que falte una tabla concreta se encarga diffFingerprints, que la
    // nombra una por una.
    expect(assertMagnitudCreible(huella(86, 106))).toEqual({ tablas: 86, politicas: 106 });
  });

  it("perder auth y storage enteros (98 → 83) NO lo atrapa el piso: es trabajo del diff", () => {
    // Documenta el límite de esta guarda a propósito. 83 sigue por encima de 80,
    // así que pasa el piso — y debe pasarlo. `diffFingerprints` reporta las 15
    // tablas ausentes con su nombre, que es el mecanismo correcto.
    expect(() => assertMagnitudCreible(huella(83, 106))).not.toThrow();
  });

  it("rechaza una huella SIMBÓLICA: una tabla y una política", () => {
    // Este es el hueco exacto que la guarda cierra: no está vacía, así que
    // `diffFingerprints` la aceptaría, y contra ella no falta nada.
    expect(() => assertMagnitudCreible(huella(1, 1))).toThrow(/demasiado pequena para ser real/);
  });

  it("nombra las DOS carencias cuando faltan las dos", () => {
    expect(() => assertMagnitudCreible(huella(1, 1))).toThrow(/solo 1 tablas.*y.*solo 1 politicas/s);
  });

  it("rechaza un esquema completo pero SIN políticas: es el modo de falla más grave", () => {
    // Restaurar las 86 tablas y perder las 106 políticas RLS es una fuga entre
    // inquilinos, no un detalle. Las tablas alcanzan; las políticas no.
    expect(() => assertMagnitudCreible(huella(86, 0))).toThrow(/solo 0 politicas RLS/);
  });

  it("rechaza políticas completas pero pocas tablas", () => {
    expect(() => assertMagnitudCreible(huella(3, 106))).toThrow(/solo 3 tablas/);
  });

  it("acepta justo en el piso y rechaza un elemento por debajo", () => {
    expect(() => assertMagnitudCreible(huella(MIN_TABLAS, MIN_POLITICAS))).not.toThrow();
    expect(() => assertMagnitudCreible(huella(MIN_TABLAS - 1, MIN_POLITICAS))).toThrow(
      /demasiado pequena/,
    );
    expect(() => assertMagnitudCreible(huella(MIN_TABLAS, MIN_POLITICAS - 1))).toThrow(
      /demasiado pequena/,
    );
  });

  it("el piso por defecto queda por DEBAJO de la realidad, para que borrar una tabla no rompa el simulacro", () => {
    expect(MIN_TABLAS).toBeLessThan(86);
    expect(MIN_POLITICAS).toBeLessThan(106);
    // …pero muy por encima de lo simbólico.
    expect(MIN_TABLAS).toBeGreaterThan(10);
    expect(MIN_POLITICAS).toBeGreaterThan(10);
  });

  it("suma las políticas de TODAS las tablas, no solo de la primera", () => {
    const repartidas = {
      filas: huella(86, 0).filas,
      politicas: Object.fromEntries(Array.from({ length: 53 }, (_, i) => [`tabla_${i}`, 2])),
    };
    expect(assertMagnitudCreible(repartidas)).toEqual({ tablas: 86, politicas: 106 });
  });

  it("acepta pisos personalizados sin tocar el módulo", () => {
    expect(assertMagnitudCreible(huella(5, 5), { minTablas: 5, minPoliticas: 5 })).toEqual({
      tablas: 5,
      politicas: 5,
    });
  });

  it("rechaza lo que ni siquiera es un objeto", () => {
    for (const basura of [null, undefined, "{}", 42, [], ["filas"]]) {
      expect(() => assertMagnitudCreible(basura)).toThrow(/no es un objeto|demasiado pequena/);
    }
  });

  it("rechaza una huella a la que le falta la dimensión 'filas' o 'politicas'", () => {
    expect(() => assertMagnitudCreible({ politicas: { t: 106 } })).toThrow(/solo 0 tablas/);
    expect(() => assertMagnitudCreible({ filas: huella(86, 0).filas })).toThrow(/solo 0 politicas/);
  });

  it("no deja que un valor no numérico infle el conteo de políticas", () => {
    const envenenada = {
      filas: huella(86, 0).filas,
      politicas: { a: "muchas", b: null, c: {}, d: 3 },
    };
    expect(() => assertMagnitudCreible(envenenada)).toThrow(/solo 3 politicas/);
  });
});
