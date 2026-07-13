import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3031"),
  APP_URL: z.string().url().default("http://localhost:3031"),
  DATA_SOURCE: z.enum(["mock", "supabase"]).default("mock"),

  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  DATABASE_URL: z.string().optional(),

  JWT_SECRET: z.string().optional(),
  SESSION_COOKIE_NAME: z.string().default("dermaland-session"),

  // Ambiente DGII vigente. Valores nuevos: testecf/certecf/ecf.
  // Compat: `cert` mapea a `certecf` y `prod` mapea a `ecf` para no romper
  // código legado que aún lee esos valores.
  DGII_ENVIRONMENT: z
    .enum(["testecf", "certecf", "ecf", "cert", "prod"])
    .default("testecf"),
  // DEPRECADAS: cert en filesystem + password en texto plano en env. El
  // sistema vigente (Fase F) guarda el .p12 CIFRADO en Supabase con
  // DGII_CERT_ENCRYPTION_KEY. Se conservan solo como fallback legado de
  // `isDgiiConfigured()`; no agregar consumidores nuevos.
  DGII_CERTIFICATE_PATH: z.string().optional(),
  DGII_CERTIFICATE_PASSWORD: z.string().optional(),
  DGII_CERT_ENCRYPTION_KEY: z.string().optional(),
  // URL base por ambiente. Si no se proveen, el cliente usa los defaults
  // hardcoded: `https://ecf.dgii.gov.do/{testecf|certecf|ecf}`.
  DGII_BASE_URL_TESTECF: z.string().url().optional(),
  DGII_BASE_URL_CERTECF: z.string().url().optional(),
  DGII_BASE_URL_ECF: z.string().url().optional(),
  // Killswitch para envío real. Default `false` — el cliente prepara el
  // payload pero NUNCA hace fetch a DGII a menos que esto sea `true` Y
  // todas las precondiciones (postulación, rango, confirmación manual,
  // ambiente!=ecf) se cumplan. Se setea solo en Preview cuando esté
  // autorizado per-tipo, NUNCA en producción.
  DGII_TESTECF_SEND_ENABLED: z
    .union([z.literal("true"), z.literal("false")])
    .default("false"),

  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  // App Secret de Meta — verifica la firma X-Hub-Signature-256 del webhook
  // (SEC-004). Si está configurado, se RECHAZAN eventos sin firma válida.
  WHATSAPP_APP_SECRET: z.string().optional(),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_DEFAULT_MODEL: z.string().default("gpt-5.4-mini"),

  // Master key (AES-256-GCM, base64 de 32 bytes) para cifrar las API keys de
  // proveedores de IA guardadas por empresa. SOLO servidor; nunca se imprime.
  // Sin ella NO se pueden guardar credenciales de IA por UI (se bloquea).
  AI_CREDENTIALS_ENCRYPTION_KEY: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Allow boot in dev with missing optional vars; only crash on hard misconfig
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Invalid environment configuration: " + JSON.stringify(parsed.error.issues),
    );
  }
}

export const env: Env = parsed.success
  ? parsed.data
  : ({
      NODE_ENV: "development",
      NEXT_PUBLIC_APP_URL: "http://localhost:3031",
      APP_URL: "http://localhost:3031",
      DATA_SOURCE: "mock",
      SESSION_COOKIE_NAME: "dermaland-session",
      DGII_ENVIRONMENT: "testecf",
      DGII_TESTECF_SEND_ENABLED: "false",
      OPENAI_DEFAULT_MODEL: "gpt-5.4-mini",
    } as Env);

/**
 * Killswitch maestro del envío real DGII testecf. Default `false` siempre.
 *
 * Aunque sea `true`, el cliente igual exige:
 *  - postulación testecf aprobada del RNC emisor (confirmada externamente),
 *  - rango e-NCF testecf autorizado por DGII para el tipo a emitir,
 *  - confirmación manual del usuario en cada envío,
 *  - ambiente resuelto === `testecf` (jamás `ecf`).
 *
 * Production NO debería tener nunca este flag activo. La validación de
 * "no es producción" se hace por ambiente, no por este flag.
 */
export function isDgiiTestecfSendEnabled(): boolean {
  return env.DGII_TESTECF_SEND_ENABLED === "true";
}

/**
 * Normaliza el valor legado de `DGII_ENVIRONMENT` al enum oficial DGII:
 *  - `cert`  → `certecf`
 *  - `prod`  → `ecf`
 *  - resto se pasa tal cual (`testecf` / `certecf` / `ecf`).
 */
export function resolveDgiiAmbiente(): "testecf" | "certecf" | "ecf" {
  switch (env.DGII_ENVIRONMENT) {
    case "cert":
      return "certecf";
    case "prod":
      return "ecf";
    case "testecf":
    case "certecf":
    case "ecf":
      return env.DGII_ENVIRONMENT;
  }
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * ¿Hay capacidad real de operar con certificado DGII?
 *
 * El sistema vigente (Fase F) guarda el `.p12` cifrado en Supabase y se
 * gobierna por `isCertificateUploadEnabled()`. Las envs legadas
 * `DGII_CERTIFICATE_PATH/PASSWORD` (deprecadas) quedan como fallback —
 * antes este helper miraba SOLO las legadas y `/api/health` reportaba un
 * estado que no correspondía al sistema real de certificados.
 */
export function isDgiiConfigured(): boolean {
  return (
    isCertificateUploadEnabled() ||
    Boolean(env.DGII_CERTIFICATE_PATH && env.DGII_CERTIFICATE_PASSWORD)
  );
}

/**
 * Fase F en runtime: el upload real de certificado solo se activa si:
 *  - Supabase está configurado (env URL + ANON_KEY).
 *  - DGII_CERT_ENCRYPTION_KEY existe (cifrado de blob + password).
 * Cuando alguno falta, la UI cae al modo simulado y NO se acepta upload
 * real desde el servidor.
 */
export function isCertificateUploadEnabled(): boolean {
  return Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL &&
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      env.DGII_CERT_ENCRYPTION_KEY &&
      env.DGII_CERT_ENCRYPTION_KEY.length >= 32 &&
      env.DATA_SOURCE === "supabase",
  );
}

export function isWhatsappConfigured(): boolean {
  return Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
}

export function isOpenAIConfigured(): boolean {
  return Boolean(env.OPENAI_API_KEY);
}

/**
 * ¿Está configurada la master key para cifrar credenciales de IA por empresa?
 * Debe ser base64 de 32 bytes (≥ 43 chars). Sin ella se bloquea el guardado de
 * claves (nunca se guardan en texto plano).
 */
export function isAiCredentialsEncryptionConfigured(): boolean {
  const k = env.AI_CREDENTIALS_ENCRYPTION_KEY;
  return Boolean(k && k.length >= 43);
}

/** Devuelve la master key o lanza (mensaje sin la clave). SOLO servidor. */
export function getAiEncryptionKeyOrThrow(): string {
  const k = env.AI_CREDENTIALS_ENCRYPTION_KEY;
  if (!k || k.length < 43) {
    throw new Error(
      "AI_CREDENTIALS_ENCRYPTION_KEY no está configurada; no se pueden guardar credenciales de IA de forma segura.",
    );
  }
  return k;
}
