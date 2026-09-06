// apps/web/src/features/dgii/services/enablement.test.ts
//
// Portado de `~/Projects/agendapp/src/lib/dgii/enablement-service.ts` +
// `enablement-evaluator.ts` (SOLO LECTURA). El pliego (task-4-brief.md, Paso 1)
// solo ejercita `puedeEmitir` con objetos `EstadoHabilitacion` armados a mano;
// las pruebas de `describe("gates de habilitación", …)` de abajo son EXACTAMENTE
// las del pliego, sin cambios. `evaluarHabilitacion` no tenía pruebas en el
// pliego (su firma es solo `(businessId)`, sin parámetro de dependencias como
// `prepararComprobante` en la tarea 5) — el segundo bloque las añade contra un
// cliente de Supabase falso, mismo patrón que `storage.test.ts`
// (`vi.mock("@/lib/supabase/server")`), para no entregar el símbolo sin probar.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { puedeEmitir, evaluarHabilitacion, type EstadoHabilitacion } from "./enablement";
import { createServiceRoleClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: vi.fn(),
}));

const listo: EstadoHabilitacion = {
  configurado: true,
  certificadoActivo: true,
  certificadoVence: new Date(Date.now() + 90 * 864e5).toISOString(),
  secuenciasActivas: 1,
  secuenciasProduccion: 0,
  bloqueos: [],
};

describe("gates de habilitación", () => {
  it("con todo puesto, se puede emitir", () => {
    expect(puedeEmitir(listo)).toBe(true);
  });

  it("sin configuración fiscal, no", () => {
    expect(puedeEmitir({ ...listo, configurado: false, bloqueos: ["Falta la configuración fiscal DGII."] })).toBe(false);
  });

  it("sin certificado activo, no: el XML tiene que ir firmado", () => {
    expect(puedeEmitir({ ...listo, certificadoActivo: false, bloqueos: ["No hay certificado activo."] })).toBe(false);
  });

  it("con el certificado vencido, no", () => {
    expect(puedeEmitir({
      ...listo,
      certificadoVence: new Date(Date.now() - 864e5).toISOString(),
      bloqueos: ["El certificado está vencido."],
    })).toBe(false);
  });

  it("sin ninguna secuencia activa, no: no hay número que consumir", () => {
    expect(puedeEmitir({ ...listo, secuenciasActivas: 0, bloqueos: ["No hay secuencia activa."] })).toBe(false);
  });

  it("cualquier bloqueo manda, aunque el resto esté bien", () => {
    // `bloqueos` es la lista que la pantalla enseña. Si trae algo y `puedeEmitir`
    // dijera que sí, la pantalla y el servidor se contradirían.
    expect(puedeEmitir({ ...listo, bloqueos: ["motivo cualquiera"] })).toBe(false);
  });
});

/** Fila de `dgii_settings` con los mínimos que exige `estaConfigurado`. */
function filaConfiguracion(over: Partial<Record<string, unknown>> = {}) {
  return {
    business_id: "biz-1",
    rnc_emisor: "131561985",
    razon_social_emisor: "DERMALAND SRL",
    direccion_emisor: "Calle 1",
    provincia_codigo: "25",
    municipio_codigo: "01",
    correo_emisor: "a@b.do",
    telefono_emisor: "8095551234",
    ambiente: "testecf",
    dgii_enabled_real_send: false,
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    ...over,
  };
}

/** Fila de `dgii_certificates` activa y vigente por defecto. */
function filaCertificado(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "cert-1",
    business_id: "biz-1",
    alias: "Principal",
    subject_dn: "CN=Test",
    issuer_dn: "CN=Test",
    serial_number: "01",
    valid_from: "2024-01-01T00:00:00.000Z",
    valid_to: new Date(Date.now() + 90 * 864e5).toISOString(),
    pkcs12_encrypted_blob: null,
    password_secret_ref: null,
    kdf: "AES-256-GCM",
    is_active: true,
    uploaded_by: null,
    created_at: "2024-01-01T00:00:00.000Z",
    revoked_at: null,
    ...over,
  };
}

/**
 * Cliente falso multi-tabla: cada `.from(tabla)` devuelve un query-builder
 * encadenable propio (no un singleton compartido, a diferencia del de
 * `dgii-settings.test.ts`) porque aquí SÍ se consultan tres tablas distintas
 * en la misma llamada a `evaluarHabilitacion` (vía `Promise.all`).
 */
function clienteFalsoMultiTabla(respuestas: Record<string, { data: unknown; error: unknown }>) {
  return {
    from: vi.fn((tabla: string) => {
      const respuesta = respuestas[tabla] ?? { data: null, error: null };
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () => Promise.resolve(respuesta),
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(respuesta).then(resolve, reject),
      };
      return builder;
    }),
  };
}

describe("evaluarHabilitacion: junta configuración, certificado y secuencias", () => {
  beforeEach(() => {
    vi.mocked(createServiceRoleClient).mockReset();
  });

  it("con todo en regla, no hay bloqueos y puedeEmitir da true", async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(
      clienteFalsoMultiTabla({
        dgii_settings: { data: filaConfiguracion(), error: null },
        dgii_certificates: { data: filaCertificado(), error: null },
        ecf_sequences: { data: [{ ambiente: "testecf" }, { ambiente: "ecf" }], error: null },
      }) as never,
    );
    const estado = await evaluarHabilitacion("biz-1");
    expect(estado.bloqueos).toEqual([]);
    expect(estado.configurado).toBe(true);
    expect(estado.certificadoActivo).toBe(true);
    expect(estado.secuenciasActivas).toBe(2);
    expect(estado.secuenciasProduccion).toBe(1);
    expect(puedeEmitir(estado)).toBe(true);
  });

  it("sin fila de configuración, bloquea con el texto de configuración", async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(
      clienteFalsoMultiTabla({
        dgii_settings: { data: null, error: null },
        dgii_certificates: { data: filaCertificado(), error: null },
        ecf_sequences: { data: [{ ambiente: "testecf" }], error: null },
      }) as never,
    );
    const estado = await evaluarHabilitacion("biz-1");
    expect(estado.configurado).toBe(false);
    expect(estado.bloqueos).toContain("Falta la configuración fiscal DGII.");
    expect(puedeEmitir(estado)).toBe(false);
  });

  it("sin certificado activo, bloquea y certificadoVence queda en null", async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(
      clienteFalsoMultiTabla({
        dgii_settings: { data: filaConfiguracion(), error: null },
        dgii_certificates: { data: null, error: null },
        ecf_sequences: { data: [{ ambiente: "testecf" }], error: null },
      }) as never,
    );
    const estado = await evaluarHabilitacion("biz-1");
    expect(estado.certificadoActivo).toBe(false);
    expect(estado.certificadoVence).toBeNull();
    expect(estado.bloqueos).toContain("No hay certificado activo.");
  });

  it("con certificado activo pero vencido, certificadoActivo sigue true y bloquea por vigencia", async () => {
    // Mismo caso que el test de `puedeEmitir` de arriba: hay una fila activa,
    // lo que falla es la fecha. `certificadoActivo` no se apaga por vencer.
    vi.mocked(createServiceRoleClient).mockReturnValue(
      clienteFalsoMultiTabla({
        dgii_settings: { data: filaConfiguracion(), error: null },
        dgii_certificates: {
          data: filaCertificado({ valid_to: new Date(Date.now() - 864e5).toISOString() }),
          error: null,
        },
        ecf_sequences: { data: [{ ambiente: "testecf" }], error: null },
      }) as never,
    );
    const estado = await evaluarHabilitacion("biz-1");
    expect(estado.certificadoActivo).toBe(true);
    expect(estado.bloqueos).toContain("El certificado está vencido.");
    expect(estado.bloqueos).not.toContain("No hay certificado activo.");
  });

  it("con certificado activo pero TODAVÍA no vigente (valid_from futuro), también bloquea por vigencia", async () => {
    // Menor (segunda tanda, revisión externa): antes esta regla solo miraba
    // `valid_to` -mismo criterio que `s3` en agendapp-, mientras
    // `certificates.ts` ya comprobaba TAMBIÉN `valid_from` al descifrar. Un
    // certificado subido con antelación pasaba este gate como "activo" sin
    // bloqueos, y el hueco solo se descubría al intentar firmar de verdad.
    // Ahora `certificadoVigente` (`certificate-validity.ts`) decide aquí
    // también.
    vi.mocked(createServiceRoleClient).mockReturnValue(
      clienteFalsoMultiTabla({
        dgii_settings: { data: filaConfiguracion(), error: null },
        dgii_certificates: {
          data: filaCertificado({ valid_from: new Date(Date.now() + 864e5).toISOString() }),
          error: null,
        },
        ecf_sequences: { data: [{ ambiente: "testecf" }], error: null },
      }) as never,
    );
    const estado = await evaluarHabilitacion("biz-1");
    expect(estado.certificadoActivo).toBe(true);
    expect(estado.bloqueos).toContain("El certificado está vencido.");
    expect(estado.bloqueos).not.toContain("No hay certificado activo.");
  });

  it("sin secuencias activas, bloquea aunque haya conteo de producción", async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(
      clienteFalsoMultiTabla({
        dgii_settings: { data: filaConfiguracion(), error: null },
        dgii_certificates: { data: filaCertificado(), error: null },
        ecf_sequences: { data: [], error: null },
      }) as never,
    );
    const estado = await evaluarHabilitacion("biz-1");
    expect(estado.secuenciasActivas).toBe(0);
    expect(estado.secuenciasProduccion).toBe(0);
    expect(estado.bloqueos).toContain("No hay secuencia activa.");
  });

  it("varios bloqueos a la vez se acumulan en orden: configuración, certificado, secuencia", async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(
      clienteFalsoMultiTabla({
        dgii_settings: { data: null, error: null },
        dgii_certificates: { data: null, error: null },
        ecf_sequences: { data: [], error: null },
      }) as never,
    );
    const estado = await evaluarHabilitacion("biz-1");
    expect(estado.bloqueos).toEqual([
      "Falta la configuración fiscal DGII.",
      "No hay certificado activo.",
      "No hay secuencia activa.",
    ]);
    expect(puedeEmitir(estado)).toBe(false);
  });

  it("sin Supabase configurado, no revienta: devuelve el estado todo bloqueado", async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(null);
    const estado = await evaluarHabilitacion("biz-1");
    expect(puedeEmitir(estado)).toBe(false);
    expect(estado.bloqueos.length).toBeGreaterThan(0);
  });
});
