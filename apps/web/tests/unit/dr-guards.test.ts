import { describe, it, expect } from "vitest";
import {
  MIN_TABLAS,
  MIN_POLITICAS,
  assertOrigenDistinto,
  assertMagnitudCreible,
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

describe("assertMagnitudCreible", () => {
  /** Construye una huella con `n` tablas y `p` políticas repartidas. */
  const huella = (n: number, p: number) => ({
    filas: Object.fromEntries(Array.from({ length: n }, (_, i) => [`tabla_${i}`, 10])),
    politicas: p > 0 ? { tabla_0: p } : {},
  });

  it("acepta la magnitud real de producción y devuelve lo que midió", () => {
    // 86 tablas rastreadas (83 en public + auth.users + storage.buckets +
    // storage.objects) y 106 políticas (101 en public + 5 en storage.objects).
    expect(assertMagnitudCreible(huella(86, 106))).toEqual({ tablas: 86, politicas: 106 });
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
