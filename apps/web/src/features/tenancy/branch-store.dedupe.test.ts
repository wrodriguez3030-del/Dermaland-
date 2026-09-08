import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchBranchesFromServer } from "./branch-store";

/**
 * 🔴 Tres componentes del panel piden las sucursales a la vez —la cabecera, el
 * filtro y la propia pantalla— y cada uno abría su propia petición. Medido en
 * el navegador: TRES `/api/branches?scope=admin` idénticas en una sola carga.
 *
 * Cada una es una función sin servidor propia: tres arranques en frío para
 * traer dos filas.
 */
const respuesta = () =>
  Promise.resolve(
    new Response(JSON.stringify({ branches: [{ id: "b1" }, { id: "b2" }] }), { status: 200 }),
  );

beforeEach(() => vi.stubGlobal("fetch", vi.fn(respuesta)));
afterEach(() => vi.unstubAllGlobals());

describe("las sucursales no se piden tres veces", () => {
  it("🔴 tres llamadas simultáneas hacen UNA sola petición", async () => {
    const [a, b, c] = await Promise.all([
      fetchBranchesFromServer("admin"),
      fetchBranchesFromServer("admin"),
      fetchBranchesFromServer("admin"),
    ]);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    // Y las tres reciben lo mismo.
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it("después de terminar, la siguiente SÍ vuelve a preguntar", async () => {
    await fetchBranchesFromServer("admin");
    await fetchBranchesFromServer("admin");
    // No es una caché: dos cargas separadas son dos peticiones.
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("scopes distintos no se pisan", async () => {
    await Promise.all([fetchBranchesFromServer("admin"), fetchBranchesFromServer("active")]);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("🔴 si falla, la siguiente reintenta de verdad", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("sin red"))));
    await expect(fetchBranchesFromServer("admin")).rejects.toThrow();
    // Sin soltar la promesa fallida, todas las siguientes heredarían el error.
    await expect(fetchBranchesFromServer("admin")).rejects.toThrow();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});
