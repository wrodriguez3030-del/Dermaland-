import { describe, it, expect, vi } from "vitest";
import { crearRepositorioConfiguracion } from "./dgii-settings";

/**
 * Cliente de mentira: encadenable como el query builder real de supabase-js
 * (cada método devuelve el mismo objeto salvo el que termina la cadena) y
 * "thenable" en cualquier punto, porque el repositorio a veces termina en
 * `.maybeSingle()`/`.single()` y a veces en el último `.eq()` (los updates
 * no llaman ningún método terminal propio).
 */
function clienteFalso(respuesta: { data: unknown; error: unknown }) {
  const llamadas: Array<{ metodo: string; args: unknown[] }> = [];
  const registrar = (metodo: string, args: unknown[]) => llamadas.push({ metodo, args });
  const builder: Record<string, unknown> = {
    select: (...args: unknown[]) => (registrar("select", args), builder),
    insert: (...args: unknown[]) => (registrar("insert", args), builder),
    update: (...args: unknown[]) => (registrar("update", args), builder),
    eq: (...args: unknown[]) => (registrar("eq", args), builder),
    maybeSingle: () => Promise.resolve(respuesta),
    single: () => Promise.resolve(respuesta),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(respuesta).then(resolve, reject),
  };
  return {
    llamadas,
    from: vi.fn(() => builder),
  };
}

describe("repositorio de configuración/certificado fiscal", () => {
  it("leerConfiguracion filtra por business_id y devuelve la fila", async () => {
    const fila = { business_id: "biz-1", ambiente: "testecf", rnc_emisor: "130000000" };
    const c = clienteFalso({ data: fila, error: null });
    const repo = crearRepositorioConfiguracion(c as never, "biz-1");
    expect(await repo.leerConfiguracion()).toEqual(fila);
    expect(c.llamadas.some((l) => l.metodo === "eq" && l.args[0] === "business_id" && l.args[1] === "biz-1")).toBe(true);
  });

  it("leerConfiguracion devuelve null si el negocio nunca configuró nada", async () => {
    const c = clienteFalso({ data: null, error: null });
    const repo = crearRepositorioConfiguracion(c as never, "biz-1");
    expect(await repo.leerConfiguracion()).toBeNull();
  });

  it("leerCertificadoActivo decodifica el bytea hex de PostgREST a Buffer sin perder un byte", async () => {
    const original = Buffer.from(JSON.stringify({ v: 1, alg: "AES-256-GCM", iv: "x", tag: "y", data: "z" }), "utf8");
    const filaCruda = {
      id: "cert-1",
      business_id: "biz-1",
      alias: "Principal",
      subject_dn: "CN=Test",
      issuer_dn: "CN=Test",
      serial_number: "01",
      valid_from: "2024-01-01T00:00:00.000Z",
      valid_to: "2034-01-01T00:00:00.000Z",
      // Formato real que entrega PostgREST para bytea: "\x" + hex.
      pkcs12_encrypted_blob: `\\x${original.toString("hex")}`,
      password_secret_ref: '{"v":1}',
      kdf: "AES-256-GCM",
      is_active: true,
      uploaded_by: null,
      created_at: "2024-01-01T00:00:00.000Z",
      revoked_at: null,
    };
    const c = clienteFalso({ data: filaCruda, error: null });
    const repo = crearRepositorioConfiguracion(c as never, "biz-1");
    const fila = await repo.leerCertificadoActivo();
    expect(fila).not.toBeNull();
    expect(Buffer.isBuffer(fila!.pkcs12_encrypted_blob)).toBe(true);
    expect(fila!.pkcs12_encrypted_blob).toEqual(original);
  });

  it("leerCertificadoActivo devuelve null si no hay ninguno activo", async () => {
    const c = clienteFalso({ data: null, error: null });
    const repo = crearRepositorioConfiguracion(c as never, "biz-1");
    expect(await repo.leerCertificadoActivo()).toBeNull();
  });

  it("insertarCertificado codifica el Buffer a hex bytea y pone business_id + is_active", async () => {
    const c = clienteFalso({ data: { id: "cert-nuevo" }, error: null });
    const repo = crearRepositorioConfiguracion(c as never, "biz-1");
    const blob = Buffer.from("contenido-sellado-de-prueba", "utf8");
    const r = await repo.insertarCertificado({
      alias: "Principal",
      subject_dn: "CN=Test",
      issuer_dn: "CN=Test",
      serial_number: "01",
      valid_from: "2024-01-01T00:00:00.000Z",
      valid_to: "2034-01-01T00:00:00.000Z",
      pkcs12_encrypted_blob: blob,
      password_secret_ref: '{"v":1}',
      uploaded_by: "user-1",
    });
    expect(r).toEqual({ id: "cert-nuevo" });
    const llamadaInsert = c.llamadas.find((l) => l.metodo === "insert");
    const payload = llamadaInsert!.args[0] as Record<string, unknown>;
    expect(payload.business_id).toBe("biz-1");
    expect(payload.is_active).toBe(true);
    expect(payload.pkcs12_encrypted_blob).toBe(`\\x${blob.toString("hex")}`);
    expect(payload.password_secret_ref).toBe('{"v":1}');
    expect(payload.uploaded_by).toBe("user-1");
  });

  it("desactivarCertificados apaga is_active pero NO toca revoked_at (no es una revocación)", async () => {
    const c = clienteFalso({ data: null, error: null });
    const repo = crearRepositorioConfiguracion(c as never, "biz-1");
    await repo.desactivarCertificados();
    const llamadaUpdate = c.llamadas.find((l) => l.metodo === "update");
    const payload = llamadaUpdate!.args[0] as Record<string, unknown>;
    expect(payload).toEqual({ is_active: false });
    expect(payload.revoked_at).toBeUndefined();
    // Filtra por el negocio Y por is_active=true (no toca los ya inactivos).
    expect(c.llamadas.filter((l) => l.metodo === "eq")).toEqual([
      { metodo: "eq", args: ["business_id", "biz-1"] },
      { metodo: "eq", args: ["is_active", true] },
    ]);
  });

  it("un error de la base SÍ es excepción, y no se traga", async () => {
    const c = clienteFalso({ data: null, error: { message: "relation does not exist" } });
    const repo = crearRepositorioConfiguracion(c as never, "biz-1");
    await expect(repo.leerConfiguracion()).rejects.toThrow(/relation does not exist/);
  });
});
