/**
 * Acceso a la configuración fiscal (`dgii_settings`) y al certificado
 * (`dgii_certificates`) de la fase 2.
 *
 * Solo traduce llamadas: el cifrado/descifrado y las reglas de vigencia viven
 * en `features/dgii/services/certificates.ts`. El `business_id` lo pone
 * SIEMPRE este repositorio, nunca quien llama — mismo contrato que
 * `dgii-sequences.ts`.
 *
 * **El cliente lo construye quien llame `crearRepositorioConfiguracion`.**
 * Las tablas nuevas solo conceden `select/insert/update` a `service_role`
 * bajo RLS con `business_id = auth_business_id()`, pero además este
 * repositorio confía en filtrar por `business_id` en cada query como
 * defensa en profundidad — igual que el resto de `repositories/supabase/`.
 * Pásale el cliente de `createServiceRoleClient()`
 * (`@/lib/supabase/server.ts`), nunca el de la sesión.
 *
 * `database.types.ts` está desactualizado para `dgii_settings` y
 * `dgii_certificates`: todavía describe el esquema VIEJO (columnas como
 * `nombre_comercial`, `base_url_testecf`, `iv`, `tag`,
 * `pkcs12_storage_bucket`) porque nadie ha regenerado los tipos desde que la
 * fase 2 renombró las tablas viejas a `*_legacy_20260906` y creó las nuevas
 * con el mismo nombre pero columnas distintas. Por eso `cliente` se tipa
 * como `SupabaseClient` A SECAS (sin el genérico `Database`), igual que
 * `dgii-sequences.ts`: así TypeScript no pelea con un esquema que ya no
 * existe en la base real. Las filas se tipan a mano contra
 * `supabase/migrations/20260906090100_dgii_fase2_tablas.sql`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DgiiAmbienteTarget } from "@/features/dgii/core/killswitches";

/** Fila de `dgii_settings` tal como la deja la fase 2 (PK = business_id, sin `id`). */
export interface FilaConfiguracionDgii {
  business_id: string;
  rnc_emisor: string | null;
  razon_social_emisor: string | null;
  direccion_emisor: string | null;
  provincia_codigo: string | null;
  municipio_codigo: string | null;
  correo_emisor: string | null;
  telefono_emisor: string | null;
  ambiente: DgiiAmbienteTarget;
  dgii_enabled_real_send: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Fila de `dgii_certificates`. `pkcs12_encrypted_blob` y `password_secret_ref`
 * son sobres sellados AES-256-GCM (ver `certificate-encryption.ts`) — NUNCA
 * texto plano de clave privada ni de contraseña. El repositorio los entrega
 * tal cual (todavía sellados): descifrarlos es responsabilidad exclusiva de
 * `certificates.ts`, con la clave de `DGII_CERT_ENCRYPTION_KEY`.
 *
 * `pkcs12_encrypted_blob` llega de Postgres como `bytea`; este repositorio
 * ya lo decodifica del formato hex de PostgREST (`\x...`) a `Buffer` — quien
 * llame nunca ve el formato de cable.
 */
export interface FilaCertificadoDgii {
  id: string;
  business_id: string;
  alias: string | null;
  subject_dn: string | null;
  issuer_dn: string | null;
  serial_number: string | null;
  valid_from: string | null;
  valid_to: string | null;
  pkcs12_encrypted_blob: Buffer | null;
  password_secret_ref: string | null;
  kdf: string | null;
  is_active: boolean;
  uploaded_by: string | null;
  created_at: string;
  revoked_at: string | null;
}

/** Datos para insertar un certificado nuevo. `business_id` e `is_active` los pone el repositorio. */
export interface NuevaFilaCertificadoDgii {
  alias: string | null;
  subject_dn: string | null;
  issuer_dn: string | null;
  serial_number: string | null;
  /** ISO 8601. */
  valid_from: string;
  /** ISO 8601. */
  valid_to: string;
  /** Sobre sellado AES-256-GCM ya serializado a bytes (JSON → utf8), SIN codificar a hex todavía. */
  pkcs12_encrypted_blob: Buffer;
  /** Sobre sellado AES-256-GCM, serializado a JSON (columna `text`, no necesita hex). */
  password_secret_ref: string;
  kdf?: string;
}

function desenvolver<T>(r: { data: T; error: { message: string } | null }, que: string): T {
  if (r.error) throw new Error(`${que}: ${r.error.message}`);
  return r.data;
}

/**
 * `bytea` → texto hex de PostgREST (formato `\x...`, el que Postgres usa
 * siempre para el INPUT de bytea sin importar `bytea_output`). Un `Buffer`
 * pasado tal cual a `.insert()` se serializaría como `{"type":"Buffer",
 * "data":[...]}`, que Postgres NO acepta como bytea — de ahí que haga falta
 * esta conversión explícita en vez de confiar en supabase-js.
 */
function bufferABytea(buf: Buffer): string {
  return `\\x${buf.toString("hex")}`;
}

/** Inverso de `bufferABytea`: hex de PostgREST (con o sin el prefijo `\x`) → `Buffer`. */
function byteaABuffer(valor: string): Buffer {
  const hex = valor.startsWith("\\x") ? valor.slice(2) : valor;
  return Buffer.from(hex, "hex");
}

function filaCertificado(row: Record<string, unknown>): FilaCertificadoDgii {
  const blob = row.pkcs12_encrypted_blob;
  return {
    id: String(row.id),
    business_id: String(row.business_id),
    alias: (row.alias as string | null) ?? null,
    subject_dn: (row.subject_dn as string | null) ?? null,
    issuer_dn: (row.issuer_dn as string | null) ?? null,
    serial_number: (row.serial_number as string | null) ?? null,
    valid_from: (row.valid_from as string | null) ?? null,
    valid_to: (row.valid_to as string | null) ?? null,
    pkcs12_encrypted_blob: typeof blob === "string" ? byteaABuffer(blob) : null,
    password_secret_ref: (row.password_secret_ref as string | null) ?? null,
    kdf: (row.kdf as string | null) ?? null,
    is_active: Boolean(row.is_active),
    uploaded_by: (row.uploaded_by as string | null) ?? null,
    created_at: String(row.created_at),
    revoked_at: (row.revoked_at as string | null) ?? null,
  };
}

export function crearRepositorioConfiguracion(cliente: SupabaseClient, businessId: string) {
  return {
    /** Configuración fiscal del negocio (`dgii_settings`). `null` si nunca se guardó. */
    async leerConfiguracion(): Promise<FilaConfiguracionDgii | null> {
      const r = await cliente
        .from("dgii_settings")
        .select("*")
        .eq("business_id", businessId)
        .maybeSingle();
      return desenvolver(r as never, "dgii_settings.select") as FilaConfiguracionDgii | null;
    },

    /** El certificado activo del negocio (a lo sumo uno, por el índice único parcial). */
    async leerCertificadoActivo(): Promise<FilaCertificadoDgii | null> {
      const r = await cliente
        .from("dgii_certificates")
        .select("*")
        .eq("business_id", businessId)
        .eq("is_active", true)
        .maybeSingle();
      const data = desenvolver(r as never, "dgii_certificates.select_activo") as Record<
        string,
        unknown
      > | null;
      return data ? filaCertificado(data) : null;
    },

    /** Inserta el certificado nuevo YA activo. Llamar `desactivarCertificados()` antes. */
    async insertarCertificado(fila: NuevaFilaCertificadoDgii): Promise<{ id: string }> {
      const r = await cliente
        .from("dgii_certificates")
        .insert({
          business_id: businessId,
          alias: fila.alias,
          subject_dn: fila.subject_dn,
          issuer_dn: fila.issuer_dn,
          serial_number: fila.serial_number,
          valid_from: fila.valid_from,
          valid_to: fila.valid_to,
          pkcs12_encrypted_blob: bufferABytea(fila.pkcs12_encrypted_blob),
          password_secret_ref: fila.password_secret_ref,
          kdf: fila.kdf ?? "AES-256-GCM",
          is_active: true,
        })
        .select("id")
        .single();
      const data = desenvolver(r as never, "dgii_certificates.insert") as { id: string };
      return { id: data.id };
    },

    /**
     * Desactiva (no revoca: `revoked_at` se queda como estaba) los
     * certificados activos del negocio. Se llama ANTES de insertar uno
     * nuevo — mismo orden que `saveEncryptedDgiiCertificate` en agendapp.
     */
    async desactivarCertificados(): Promise<void> {
      const r = await cliente
        .from("dgii_certificates")
        .update({ is_active: false })
        .eq("business_id", businessId)
        .eq("is_active", true);
      desenvolver(r as never, "dgii_certificates.desactivar");
    },
  };
}

export type RepositorioConfiguracion = ReturnType<typeof crearRepositorioConfiguracion>;
