import { describe, it, expect } from "vitest";
import {
  nombreGalleta,
  nuevoDispositivo,
  codificar,
  parsear,
  hashSecreto,
} from "./trusted-device-cookie";

/**
 * Esta galleta se salta el segundo factor. Lo que se prueba es lo que impide
 * que se pueda falsificar o confundir:
 *
 *  - Lo que viaja NO es lo que se guarda: en la base solo va el hash.
 *  - Una galleta manipulada se rechaza ANTES de tocar la base.
 *  - Dos personas en la misma computadora no se pisan la galleta.
 */
describe("galleta de computadora de confianza", () => {
  it("🔴 dos personas en la MISMA computadora tienen galletas distintas", () => {
    // En el mostrador la comparten. Con un nombre único, la segunda pisaría la
    // de la primera y esta volvería a teclear el código sin saber por qué.
    const a = nombreGalleta("11111111-2222-4333-8444-555555555555");
    const b = nombreGalleta("99999999-2222-4333-8444-555555555555");
    expect(a).not.toBe(b);
    expect(a.startsWith("dl_td_")).toBe(true);
  });

  it("el nombre es estable para la misma persona", () => {
    expect(nombreGalleta("11111111-2222-4333-8444-555555555555")).toBe(
      nombreGalleta("11111111-2222-4333-8444-555555555555"),
    );
  });

  it("🔴 dos dispositivos nuevos nunca coinciden", () => {
    const vistos = new Set(Array.from({ length: 200 }, () => codificar(nuevoDispositivo())));
    expect(vistos.size).toBe(200);
  });

  it("ida y vuelta: lo que se codifica se parsea igual", () => {
    const d = nuevoDispositivo();
    const leido = parsear(codificar(d));
    expect(leido?.deviceId).toBe(d.deviceId);
    expect(Array.from(leido?.secreto ?? [])).toEqual(Array.from(d.secreto));
  });

  it("🔴 una galleta manipulada se rechaza sin tocar la base", () => {
    expect(parsear("")).toBeNull();
    expect(parsear(undefined)).toBeNull();
    expect(parsear("sin-punto")).toBeNull();
    // Id que no es uuid: ni se consulta.
    expect(parsear("no-es-uuid.AAAA")).toBeNull();
    // Secreto de largo equivocado.
    const d = nuevoDispositivo();
    expect(parsear(`${d.deviceId}.QUJD`)).toBeNull();
  });

  it("🔴 el hash es estable y NO deja recuperar el secreto", async () => {
    const d = nuevoDispositivo();
    const h1 = await hashSecreto(d.secreto);
    const h2 = await hashSecreto(d.secreto);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    // Lo que se guarda no contiene lo que viaja.
    expect(codificar(d)).not.toContain(h1);
    expect(h1).not.toContain(codificar(d).split(".")[1]);
  });

  it("🔴 secretos distintos dan hashes distintos", async () => {
    const a = await hashSecreto(nuevoDispositivo().secreto);
    const b = await hashSecreto(nuevoDispositivo().secreto);
    expect(a).not.toBe(b);
  });

  it("el id de la fila es un uuid válido para Postgres", () => {
    expect(nuevoDispositivo().deviceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

describe("robustez del nombre de la galleta", () => {
  it("🔴 un id ausente NO revienta: esto corre en cada petición del sistema", () => {
    // Una excepción aquí no rompe una pantalla: deja el sistema entero sin
    // responder, porque el middleware corre antes que todo.
    expect(nombreGalleta(undefined as unknown as string)).toBe("");
    expect(nombreGalleta(null as unknown as string)).toBe("");
    expect(nombreGalleta("")).toBe("");
  });
});
