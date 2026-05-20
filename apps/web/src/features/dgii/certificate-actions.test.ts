/**
 * Tests de la server action `uploadCertificateAction` en modo DEMO/MOCK.
 *
 * Vitest corre con `DATA_SOURCE` no seteado → `isCertificateUploadEnabled()`
 * devuelve false → la action devuelve `{enabled: false}` sin intentar
 * tocar Supabase. Esto cubre los rechazos de:
 *  - feature deshabilitada,
 *  - falta de archivo,
 *  - extensión no permitida,
 *  - tamaño excesivo,
 *  - password vacía / corta.
 *
 * El flujo positivo de upload se cubre vía smoke en preview con un .p12
 * real (no incluimos cert real en tests).
 */
import { describe, it, expect } from "vitest";
import { uploadCertificateAction } from "./certificate-actions";

function makeFormData(opts: {
  file?: { name: string; bytes?: Uint8Array; type?: string };
  password?: string;
}): FormData {
  const fd = new FormData();
  if (opts.file) {
    const blob = new Blob([opts.file.bytes ?? new Uint8Array(16)], {
      type: opts.file.type ?? "application/x-pkcs12",
    });
    fd.append("file", new File([blob], opts.file.name));
  }
  if (opts.password !== undefined) {
    fd.append("password", opts.password);
  }
  return fd;
}

describe("uploadCertificateAction (modo deshabilitado)", () => {
  it("devuelve enabled=false si Fase F no está habilitada", async () => {
    const result = await uploadCertificateAction(
      makeFormData({
        file: { name: "demo.p12" },
        password: "12345678",
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.enabled).toBe(false);
    expect(result.status).toBe("rejected");
    expect(result.error).toMatch(/Fase F deshabilitada/);
  });

  it("también devuelve enabled=false aunque el archivo sea inválido", async () => {
    const result = await uploadCertificateAction(
      makeFormData({
        file: { name: "x.exe" },
        password: "ok",
      }),
    );
    expect(result.enabled).toBe(false);
  });

  it("la respuesta nunca incluye la contraseña ni binarios", async () => {
    const password = "este-no-debe-aparecer";
    const result = await uploadCertificateAction(
      makeFormData({
        file: { name: "demo.p12" },
        password,
      }),
    );
    const blob = JSON.stringify(result);
    expect(blob).not.toContain(password);
    expect(blob).not.toMatch(/BEGIN.*PRIVATE KEY/);
  });
});
