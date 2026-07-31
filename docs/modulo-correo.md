# Módulo de Correo — documentación y guía de portabilidad

> **Origen:** DermaLand `apps/web` (Next.js 15 App Router · TypeScript · Supabase).
> **Destino previsto:** PalusaApp (Supabase self-hosted) y DoctorApp (Prisma + Neon).
> **Última revisión:** 2026-07-30 · versión del módulo documentada: DermaLand v0.98.1

Este documento es autocontenido: con él se puede reimplementar el módulo en otro
sistema sin abrir el repositorio de DermaLand. Incluye el código real de las
piezas críticas (cifrado, resolución de credenciales, SQL), no pseudocódigo.

---

## 1 · Alcance

### Qué hace

Permite que **cada negocio/tenant envíe correo transaccional desde su propia
cuenta de Gmail**, con la contraseña de aplicación guardada **cifrada** en la
base de datos y configurable desde la UI por un administrador — sin tocar
variables de entorno ni redesplegar.

Tres capacidades concretas:

1. **Configurar** la cuenta remitente y su contraseña de aplicación (pantalla de
   administración).
2. **Probar** la configuración con un correo de prueba antes de usarla en real.
3. **Enviar** correo transaccional desde el servidor (en DermaLand: la factura al
   cliente).

### Qué NO hace

Es deliberadamente pequeño. **No** incluye, y no deberías esperarlo al portarlo:

- ❌ Cola de envíos, reintentos ni trabajos en segundo plano (el envío es
  síncrono dentro del request).
- ❌ Motor de plantillas. El HTML se construye con funciones TypeScript.
- ❌ Campañas, listas de distribución ni desuscripción.
- ❌ Adjuntos (el PDF se entrega como **enlace público**, no adjunto — ver §9).
- ❌ Bandeja de entrada, historial de correos ni seguimiento de aperturas.
- ❌ OAuth de Google. Usa **SMTP + contraseña de aplicación**, que es mucho más
  simple y no exige verificación de app ante Google.

### Por qué Gmail SMTP y no un proveedor transaccional

El remitente real es la cuenta Gmail del negocio. El cliente ve un correo que
viene de la farmacia/clínica y **sus respuestas llegan a esa bandeja**. Con
Resend/SendGrid habría que verificar dominio y las respuestas caerían en el
vacío. El costo: el tope de envío de Gmail (~500/día en cuentas gratuitas), que
para este volumen sobra.

---

## 2 · Arquitectura

```
┌──────────────────────────────┐
│ UI · /admin/configuracion/   │  Pantalla de administración (client component)
│      correo                  │  Muestra: estado + máscara ••••abcd
└──────────────┬───────────────┘  NUNCA recibe la contraseña
               │ fetch
               ▼
┌──────────────────────────────┐
│ API · /api/settings/email    │  GET estado · PUT guardar
│      /api/settings/email/test│  POST prueba (rate-limited)
│      <ruta de negocio>       │  POST envío real
└──────────────┬───────────────┘  Gate: sesión + rol admin/manager
               │
               ▼
┌──────────────────────────────┐
│ email-settings-service       │  Cifra/descifra · resuelve credenciales
│  · getEmailSettingsStatus    │  Prioridad: BD (cifrada) → variables de entorno
│  · saveEmailSettings         │
│  · resolveGmailCredentials   │
└──────┬────────────────┬──────┘
       │                │
       ▼                ▼
┌─────────────┐  ┌──────────────────┐
│ cipher      │  │ tabla            │
│ AES-256-GCM │  │ email_settings   │  RLS/scoping por tenant
└─────────────┘  └──────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ gmail.ts · sendEmail()       │  nodemailer → smtp.gmail.com:465 (TLS)
└──────────────────────────────┘
```

**Regla de oro del diseño:** `sendEmail()` **no sabe** de dónde salen las
credenciales — se las pasan. Eso permite cambiar el origen (BD, entorno, un
vault) sin tocar el transporte, y hace el módulo trivial de testear.

---

## 3 · Inventario de piezas

Seis archivos, ~738 líneas en total.

| Archivo | LOC | Responsabilidad |
|---|---:|---|
| `server/services/email/gmail.ts` | 58 | Transporte. Recibe credenciales, envía, devuelve `{ok}`/`{error}`. Sin estado. |
| `server/services/email/email-settings-service.ts` | 139 | Persistencia + cifrado + resolución de credenciales. |
| `server/crypto/ai-cipher.ts` | 122 | AES-256-GCM (`encrypt`/`decrypt`/`mask`). **Compartido** con el módulo de IA. |
| `app/api/settings/email/route.ts` | 88 | `GET` estado · `PUT` guardar. |
| `app/api/settings/email/test/route.ts` | 99 | `POST` correo de prueba + rate limit. |
| `app/(app)/admin/configuracion/correo/page.tsx` | 223 | UI de configuración y prueba. |

**Consumidor de ejemplo** (no es parte del módulo, es un caso de uso):
`app/api/proformas/[id]/share/email/route.ts` (131 LOC) — envía la factura.

Apoyos reutilizados: `server/security/rate-limit.ts` (limitador en memoria) y
`features/sales/invoice-email-html.ts` (constructor de HTML).

---

## 4 · Modelo de datos

Una sola tabla, una fila por tenant.

### 4.1 · SQL real (Supabase / Postgres)

```sql
-- Configuración de correo por negocio.
-- Guarda el usuario Gmail + la "contraseña de aplicación" CIFRADA (AES-256-GCM).
-- La contraseña NUNCA se guarda en claro ni se devuelve al cliente.

create table if not exists public.email_settings (
  business_id        uuid primary key,
  gmail_user         text not null default 'cuenta@gmail.com',
  encrypted_password text,
  iv                 text,
  auth_tag           text,
  encryption_version integer not null default 1,
  last_four          text,
  updated_at         timestamptz not null default now(),
  updated_by         uuid
);

comment on table public.email_settings is
  'Config de correo por negocio: usuario Gmail + contraseña de aplicación cifrada (AES-256-GCM). La contraseña NUNCA se guarda en claro ni se devuelve al cliente.';

alter table public.email_settings enable row level security;

drop policy if exists email_settings_tenant on public.email_settings;
create policy email_settings_tenant on public.email_settings
  for all
  using      (business_id = (select auth_business_id()))
  with check (business_id = (select auth_business_id()));

grant select, insert, update, delete on public.email_settings to authenticated, service_role;
```

`auth_business_id()` es el helper de DermaLand que lee el `business_id` del JWT.
**Al portar, sustitúyelo por el helper equivalente de tu sistema** (§11).

### 4.2 · Decisiones del esquema

| Decisión | Por qué |
|---|---|
| `business_id` como **PK**, no un `id` propio | Una configuración por tenant, garantizada por la base. El `upsert` con `onConflict: business_id` es atómico y no necesita `SELECT` previo. |
| `iv` y `auth_tag` en **columnas separadas** | Legible y auditable. Un blob concatenado obliga a parsear en cada lectura y esconde errores de formato. |
| `encryption_version` | Permite rotar la master key o el algoritmo sin migración destructiva: se escribe v2 y se lee v1 o v2 según la fila. |
| `last_four` **en claro** | No es secreto: son los últimos 4 caracteres, y son lo único que permite a un admin confirmar *cuál* contraseña está guardada sin poder verla. |
| `gmail_user` con `not null default` | El sistema siempre tiene un remitente válido aunque nadie haya configurado nada. |
| Sin columna `password` | No existe camino de código que pueda guardar la contraseña en claro por accidente. |

### 4.3 · Equivalente Prisma (DoctorApp)

```prisma
model EmailSettings {
  // Ajusta el nombre/tipo del scope al de tu sistema (tenantId, clinicId, …).
  businessId        String   @id @map("business_id") @db.Uuid
  gmailUser         String   @default("cuenta@gmail.com") @map("gmail_user")
  encryptedPassword String?  @map("encrypted_password")
  iv                String?
  authTag           String?  @map("auth_tag")
  encryptionVersion Int      @default(1) @map("encryption_version")
  lastFour          String?  @map("last_four")
  updatedAt         DateTime @updatedAt @map("updated_at")
  updatedBy         String?  @map("updated_by") @db.Uuid

  @@map("email_settings")
}
```

> ⚠️ **Prisma no activa RLS.** Tras `prisma migrate`, hay que aplicar las
> políticas a mano (en DoctorApp: `scripts/secure-rls.mjs`). Ver §11.2.

---

## 5 · Cifrado (AES-256-GCM)

### 5.1 · Reglas no negociables

1. La master key vive **solo** en una variable de entorno del servidor
   (32 bytes en base64/base64url). Nunca se imprime, nunca se loguea.
2. Se descifra **únicamente en el servidor**, justo antes de enviar.
3. La contraseña descifrada **nunca** se devuelve al cliente ni se persiste en
   claro.
4. `ciphertext`, `iv` y `authTag` se guardan por separado, con
   `encryption_version` para rotaciones futuras.
5. Usa **Web Crypto** (`node:crypto`.`webcrypto`) — sin dependencias nativas, y
   funciona igual en Node y en runtimes serverless.

### 5.2 · Contrato

```ts
interface SealedApiKey {
  ciphertext: string;  // base64
  iv: string;          // base64, 12 bytes
  authTag: string;     // base64, 16 bytes
  version: number;
  lastFour: string;    // últimos 4 caracteres — NO es secreto
}

encryptApiKey(plaintext: string, masterKey: string): Promise<SealedApiKey>
decryptApiKey(sealed: Pick<SealedApiKey,'ciphertext'|'iv'|'authTag'>, masterKey: string): Promise<string>
maskApiKey(lastFour: string | null): string   // → "••••••••••••abcd"
```

### 5.3 · Implementación (copiar tal cual)

```ts
import "server-only";
import { webcrypto } from "node:crypto";

const KEY_BYTES = 32;
const IV_BYTES  = 12;
const TAG_BYTES = 16;
export const ENCRYPTION_VERSION = 1;

function decodeKeyMaterial(keyString: string): Uint8Array {
  // Acepta base64 y base64url, con o sin padding.
  let s = keyString.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4;
  if (pad === 2) s += "==";
  else if (pad === 3) s += "=";
  else if (pad === 1) throw new Error("longitud base64 inválida");
  const buf = Buffer.from(s, "base64");
  if (buf.length !== KEY_BYTES) throw new Error(`la master key debe ser de ${KEY_BYTES} bytes`);
  return new Uint8Array(buf);
}

async function importKey(keyString: string): Promise<CryptoKey> {
  return webcrypto.subtle.importKey(
    "raw", decodeKeyMaterial(keyString) as BufferSource,
    { name: "AES-GCM" }, false, ["encrypt", "decrypt"],
  );
}

export async function encryptApiKey(apiKey: string, masterKey: string): Promise<SealedApiKey> {
  const trimmed = apiKey.trim();
  if (!trimmed) throw new Error("clave vacía");
  const cryptoKey = await importKey(masterKey);
  const iv = webcrypto.getRandomValues(new Uint8Array(IV_BYTES));
  // Web Crypto devuelve ciphertext||tag concatenados; los separamos.
  const cipherWithTag = new Uint8Array(await webcrypto.subtle.encrypt(
    { name: "AES-GCM", iv }, cryptoKey, new TextEncoder().encode(trimmed) as BufferSource,
  ));
  const cipher = cipherWithTag.slice(0, cipherWithTag.length - TAG_BYTES);
  const tag    = cipherWithTag.slice(cipherWithTag.length - TAG_BYTES);
  return {
    ciphertext: Buffer.from(cipher).toString("base64"),
    iv:         Buffer.from(iv).toString("base64"),
    authTag:    Buffer.from(tag).toString("base64"),
    version:    ENCRYPTION_VERSION,
    lastFour:   trimmed.slice(-4),
  };
}

export async function decryptApiKey(
  sealed: Pick<SealedApiKey, "ciphertext" | "iv" | "authTag">,
  masterKey: string,
): Promise<string> {
  const cipher = new Uint8Array(Buffer.from(sealed.ciphertext, "base64"));
  const iv     = new Uint8Array(Buffer.from(sealed.iv, "base64"));
  const tag    = new Uint8Array(Buffer.from(sealed.authTag, "base64"));
  const cipherWithTag = new Uint8Array(cipher.length + tag.length);
  cipherWithTag.set(cipher, 0);
  cipherWithTag.set(tag, cipher.length);
  const cryptoKey = await importKey(masterKey);
  try {
    const plain = await webcrypto.subtle.decrypt(
      { name: "AES-GCM", iv }, cryptoKey, cipherWithTag as BufferSource,
    );
    return new TextDecoder().decode(plain);
  } catch {
    // Mensaje SIN la clave ni el dato.
    throw new Error("descifrado falló (master key incorrecta o dato alterado)");
  }
}

export function maskApiKey(lastFour: string | null | undefined): string {
  return `••••••••••••${lastFour ?? "----"}`;
}
```

### 5.4 · Generar la master key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Guárdala en la variable de entorno del servidor (§7.3). El validador de entorno
comprueba `length >= 43` (32 bytes en base64 ocupan 44 caracteres con padding).

> 💡 **Reutiliza el cifrador que ya tengas.** En DermaLand este archivo se llama
> `ai-cipher.ts` porque nació para las API keys de IA y el módulo de correo lo
> reusa — de ahí que la variable se llame `AI_CREDENTIALS_ENCRYPTION_KEY`. Si tu
> sistema ya cifra secretos con AES-256-GCM, **usa ese**; no dupliques master keys.

---

## 6 · Contratos de API

Todas las rutas son `export const dynamic = "force-dynamic"` (leen sesión).

### 6.1 · `GET /api/settings/email` — estado

Solo admin/manager. **Nunca** devuelve la contraseña.

```jsonc
// 200
{
  "gmailUser": "cuenta@gmail.com",
  "configured": true,
  "maskedPassword": "••••••••••••mnop",  // null si no hay
  "updatedAt": "2026-07-22T14:03:11.000Z"
}
```

| Código | Cuándo |
|---|---|
| `401` | Sin sesión |
| `403` | Rol distinto de admin/manager (y no platform admin) |
| `409` | El sistema corre contra datos mock, no contra la base real |
| `400` | Error al leer |

### 6.2 · `PUT /api/settings/email` — guardar

```jsonc
// Petición
{ "gmailUser": "cuenta@gmail.com", "appPassword": "abcd efgh ijkl mnop" }
// 200
{ "ok": true }
```

- Los espacios de la contraseña se eliminan **antes** de validar y cifrar
  (Google la muestra en grupos de 4; el usuario la pega tal cual).
- Si la master key no está configurada → error explícito, **no** guarda en claro.
- `422`/`400` si viene vacía.

### 6.3 · `POST /api/settings/email/test` — correo de prueba

```jsonc
{ "to": "alguien@correo.com" }   →   { "ok": true }
```

| Código | Cuándo |
|---|---|
| `422` | Correo con formato inválido |
| `429` | **Rate limit: 5 por minuto por negocio** + cabecera `Retry-After` |
| `503` | `{ "notConfigured": true }` — aún no hay contraseña guardada |
| `502` | SMTP rechazó el envío (se propaga el mensaje de Gmail) |

> 🔒 **Por qué el rate limit está aquí y no en el resto:** este endpoint envía a
> un destinatario **arbitrario** desde la cuenta Gmail del negocio. Sin tope es
> un relay de spam autenticado. Los demás endpoints envían a destinatarios
> derivados de datos propios.

### 6.4 · `POST <ruta-de-negocio>/share/email` — envío real

Ejemplo en DermaLand: `POST /api/proformas/[id]/share/email` con `{ "to": "..." }`.
La secuencia canónica:

1. Validar formato del correo → `422`.
2. Cargar la entidad a enviar → `404` si no existe (mensaje neutro, sin filtrar
   si el id existe en otro tenant).
3. Firmar el token del enlace público → `503` si los enlaces no están habilitados.
4. `resolveGmailCredentials(tenantId)` → `503` + `notConfigured: true` si no hay.
5. Construir asunto + HTML.
6. `sendEmail()` → `502` si falla el SMTP.
7. **Auditar** el envío (best-effort, dentro de `try/catch`: la auditoría nunca
   debe impedir ni revertir un correo ya enviado).
8. `200 { ok: true, id }`.

### 6.5 · El contrato `notConfigured`

Un `503` con `{ notConfigured: true }` **no es un error**: es una señal de
producto. La UI la usa para degradar con elegancia — ofrece abrir el cliente de
correo del usuario (`mailto:`) en vez de mostrar un fallo. Consérvalo al portar.

---

## 7 · Resolución de credenciales

### 7.1 · El orden y por qué

```
1. Base de datos (cifrada, por tenant)   ← gana siempre
2. Variables de entorno                  ← respaldo
3. null                                  → notConfigured
```

**Por qué la BD primero:** es multi-tenant y la cambia el administrador desde la
UI sin redesplegar. El entorno es global — si ganara, un tenant nuevo enviaría
desde la cuenta equivocada.

**Por qué el entorno como respaldo:** permite arrancar el sistema, correr
Preview/staging y sobrevivir a un fallo de descifrado sin que el correo se caiga.

### 7.2 · Implementación

```ts
export async function resolveGmailCredentials(
  tenantId: string,
): Promise<{ user: string; pass: string } | null> {
  // 1) BD (por tenant).
  try {
    if (isEncryptionConfigured()) {
      const row = await loadEmailSettings(tenantId);   // Supabase o Prisma
      if (row?.encrypted_password && row.iv && row.auth_tag) {
        const pass = await decryptApiKey(
          { ciphertext: row.encrypted_password, iv: row.iv, authTag: row.auth_tag },
          getEncryptionKeyOrThrow(),
        );
        if (pass) return { user: row.gmail_user || DEFAULT_GMAIL_USER, pass };
      }
    }
  } catch {
    // Si falla la BD o el descifrado, caer al respaldo de entorno.
  }

  // 2) Variables de entorno (respaldo).
  const envPass = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");
  if (envPass) {
    return { user: process.env.GMAIL_USER || DEFAULT_GMAIL_USER, pass: envPass };
  }
  return null;
}
```

> ⚠️ El `catch` vacío es **intencional pero peligroso**: se traga fallos de
> descifrado en silencio. Al portar, considera registrar el fallo (sin la clave
> ni el ciphertext) para no depurar a ciegas un "el correo salió desde la cuenta
> equivocada".

### 7.3 · Variables de entorno

| Variable | Obligatoria | Para qué |
|---|---|---|
| `AI_CREDENTIALS_ENCRYPTION_KEY` | Sí, para configurar por UI | Master key AES-256-GCM (32 bytes base64). Sin ella, guardar se **bloquea**. |
| `GMAIL_USER` | No | Remitente de respaldo. |
| `GMAIL_APP_PASSWORD` | No | Contraseña de respaldo (sin espacios). |
| `EMAIL_FROM_NAME` | No | Nombre visible del remitente. Default: el del sistema. |
| `NEXT_PUBLIC_APP_URL` | Sí en producción | Base absoluta de los enlaces del correo (§9.2). |

---

## 8 · Transporte

```ts
import "server-only";
import nodemailer from "nodemailer";          // ^9.0.3

export async function sendEmail(
  input: { to: string; subject: string; html: string; replyTo?: string },
  creds: { user: string; pass: string },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = creds.user;
  const pass = (creds.pass || "").replace(/\s+/g, "");   // Google la muestra con espacios
  const fromName = process.env.EMAIL_FROM_NAME || "Sistema";

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,                                       // TLS implícito
      auth: { user, pass },
    });

    const info = await transporter.sendMail({
      from: `${fromName} <${user}>`,
      to: input.to,
      subject: input.subject,
      html: input.html,
      replyTo: input.replyTo ?? user,                     // respuestas → la cuenta del negocio
    });

    return { ok: true, id: info.messageId ?? "" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
```

**Puntos de diseño:**

- **Nunca lanza.** Devuelve un resultado discriminado, así que quien llama decide
  el código HTTP en vez de envolver todo en `try/catch`.
- `import "server-only"` — falla en tiempo de compilación si alguien lo importa
  desde un componente de cliente. Ponlo en **todos** los archivos del módulo que
  tocan secretos.
- **Puerto 465 + `secure: true`**, no 587 + STARTTLS: menos estados de fallo.
- El transporter se crea por envío. Con el volumen esperado es irrelevante; si
  algún día envías en lote, crea uno y reúsalo con `pool: true`.

---

## 9 · El HTML del correo

### 9.1 · Reglas de compatibilidad

Los clientes de correo no son navegadores. Gmail elimina `<style>`, Outlook usa
el motor de Word:

- **Estilos en línea**, siempre. Nada de clases ni hojas de estilo.
- **Layout con `<table role="presentation">`**, no flexbox ni grid.
- **Ancho fijo + `max-width:100%`** (480–600 px) para que se vea bien en móvil.
- **Escapar toda entrada** (nombre del cliente, del comercio) con un `escapeHtml`.
- **Imágenes por URL absoluta**; muchos clientes las bloquean, así que el correo
  debe entenderse sin ellas (nunca pongas información solo en la imagen).

Estructura usada en DermaLand: encabezado con color de marca + logo → saludo →
documento y total → botón de acción → nota legal.

### 9.2 · Enlaces absolutos: la base viene de la configuración, no del `Host`

```ts
const configuredBase = env.NEXT_PUBLIC_APP_URL;
const origin =
  configuredBase && !configuredBase.includes("localhost")
    ? configuredBase
    : req.nextUrl.origin;      // solo dev
```

**Por qué:** construir la URL desde la cabecera `Host` del request permite
*host-header injection* — un atacante envía una petición con `Host:` malicioso y
el correo legítimo, firmado y enviado desde tu cuenta, lleva un enlace a su
servidor. La base **siempre** sale de la configuración en producción.

### 9.3 · Enlace público en vez de adjunto

DermaLand no adjunta el PDF: envía un botón a `/factura/<token>`, una ruta
**pública** (sin login) protegida por un token **HMAC** firmado por el servidor.
Ventajas: el correo pesa nada, no lo bloquean los filtros de adjuntos, el
contenido puede actualizarse, y el token se puede caducar o revocar.

Al portar: si tu sistema no tiene rutas públicas con token firmado, esta parte es
un módulo aparte — o adjunta el PDF y acepta el peso.

---

## 10 · UI de configuración

Un solo componente de cliente, `~220 LOC`, con tres bloques:

1. **Estado** — insignia `Configurado` / `Sin configurar` + máscara
   `••••••••••••mnop`.
2. **Formulario** — cuenta remitente (`type="email"`) y contraseña
   (`type="password"`, `autoComplete="off"`).
3. **Prueba** — destinatario + botón "Enviar prueba".

**Detalles que sí importan:**

| Detalle | Por qué |
|---|---|
| Tras guardar, el campo de contraseña se **limpia** y se recarga el estado | La contraseña no queda en memoria del navegador ni en el DOM. |
| El placeholder cambia a `•••• (deja vacío para no cambiarla)` cuando ya hay una | Comunica que no hace falta reescribirla para cambiar solo el remitente. |
| Enlace directo a `myaccount.google.com/apppasswords` + "requiere Verificación en 2 pasos" | Es el punto donde más se atasca el usuario. |
| Texto explícito: "Se guarda cifrada; nadie puede verla luego" | Fija la expectativa: ni el soporte podrá recuperarla. |
| El destinatario de prueba se **prellena** con la propia cuenta | Un clic para validar. |

---

## 11 · Guía de portabilidad

El ~80 % del módulo es idéntico en ambos destinos. Solo cambian tres cosas:
**cómo se accede a la BD**, **cómo se aísla el tenant** y **cómo se autoriza**.

### 11.0 · Lo que se copia sin cambios

- `gmail.ts` (transporte) — íntegro.
- El cifrador AES-256-GCM — íntegro, **o reusa el que ya tengas**.
- Los contratos de API (§6), incluida la señal `notConfigured`.
- El orden de resolución de credenciales (§7).
- Las reglas del HTML (§9.1) y la base absoluta desde configuración (§9.2).
- La UI (§10), adaptando los componentes visuales a tu librería.

### 11.1 · PalusaApp (Supabase self-hosted)

Es el caso fácil: mismo stack que el origen.

| Punto | Qué hacer |
|---|---|
| Tabla | Aplicar el SQL de §4.1 **renombrando `business_id` al nombre real de tu columna de tenant** (verificar si es `tenant_id`). |
| DDL | No hay Supabase CLI contra el self-hosted: aplicar por `ssh` + `docker exec palusa-db psql`. Terminar con `NOTIFY pgrst, 'reload schema';` para que PostgREST vea la tabla. |
| RLS | Sustituir `auth_business_id()` por el helper de tenant de PalusaApp. **Deny-by-default**: sin política, nadie lee. |
| Claims | El claim de tenant debe venir en **`app_metadata`** del JWT, nunca en `user_metadata` (el usuario puede modificar ese último). |
| Cifrado | Copiar el cifrador. Generar una master key **propia** (no reutilizar la de DermaLand). |
| Cliente tipado | La tabla no estará en los tipos generados hasta regenerarlos; hasta entonces, castear el cliente como hace DermaLand. |
| Autorización | Reemplazar `role === "admin" \|\| "manager"` por el modelo de roles de PalusaApp. |

⚠️ **Trampa conocida de Supabase + RLS:** un `.insert().select()` exige **también**
la política de `SELECT`, no solo la de `INSERT`. El `upsert` de §4 devuelve datos
por defecto; si da error de RLS, probar con `Prefer: return=minimal` para aislar
la causa.

### 11.2 · DoctorApp (Prisma + Neon)

| Punto | Qué hacer |
|---|---|
| Tabla | Modelo Prisma de §4.3 + `prisma migrate`. |
| **RLS** | **Prisma NO activa RLS al crear tablas.** Tras cada migración hay que correr el script que aplica las políticas (`scripts/secure-rls.mjs`), o la tabla queda abierta. |
| Aislamiento | Prisma se conecta con un rol que normalmente **evade** RLS → el filtrado por tenant debe hacerse **explícito en la capa de aplicación**, en cada query. La RLS es la segunda línea, no la única. |
| Cifrado | **Ya existe** un cifrador AES-256-GCM en el módulo de Asistente IA. Reúsalo con su master key; no crees una segunda. |
| Autorización | Encajar en el sistema de permisos existente (estilo `ia.*`): crear `correo.configurar` / `correo.enviar` en vez de comparar roles a mano. |
| Sustituir mensajería asistida | DoctorApp hoy usa `mailto:` (envío asistido). Este módulo lo convierte en envío **real**. Mantén el `mailto:` como respaldo cuando la respuesta sea `notConfigured` (§6.5). |
| Rutas públicas | Si envías enlaces (recetas, resultados), la ruta pública debe estar en la lista de excepciones del proxy/middleware, o el login la interceptará. |
| Zona horaria | Formatear cualquier fecha del correo con el helper central de fechas, no con `toLocaleString()` del servidor. |

---

## 12 · Checklist de implementación

Orden recomendado — cada paso es verificable por separado.

- [ ] **1. Master key.** Generar (§5.4) y ponerla en el entorno de desarrollo,
      Preview y Producción. **Nunca** commitearla.
- [ ] **2. Cifrado.** Copiar o reusar el cifrador. *Verificar:* cifrar y
      descifrar una cadena devuelve la original; con la master key incorrecta,
      falla.
- [ ] **3. Tabla.** Migración + RLS/scoping. *Verificar:* un usuario del tenant A
      no ve la fila del tenant B.
- [ ] **4. Servicio.** `getStatus` / `save` / `resolveCredentials`. *Verificar:*
      `getStatus` nunca devuelve la contraseña, ni siquiera cifrada.
- [ ] **5. Transporte.** `sendEmail`. *Verificar:* con credenciales inválidas
      devuelve `{ok:false}` en vez de lanzar.
- [ ] **6. Rutas `GET`/`PUT`.** Con el gate de rol. *Verificar:* un usuario sin
      permiso recibe `403`.
- [ ] **7. Ruta de prueba** + rate limit. *Verificar:* el sexto intento en un
      minuto devuelve `429` con `Retry-After`.
- [ ] **8. UI.** *Verificar:* tras guardar, el campo se limpia y aparece la
      máscara.
- [ ] **9. Cuenta Gmail.** Activar Verificación en 2 pasos → crear contraseña de
      aplicación → pegarla → enviar prueba → **confirmar que llega**.
- [ ] **10. Primer consumidor real** + auditoría del envío.

### Pruebas de aceptación

| # | Escenario | Resultado esperado |
|---|---|---|
| 1 | Guardar contraseña y leer la fila directo en la BD | El valor está cifrado, ilegible |
| 2 | `GET` estado con la contraseña guardada | `configured:true`, máscara; **ninguna** traza de la contraseña |
| 3 | Enviar prueba sin configurar nada | `503` con `notConfigured:true` |
| 4 | Enviar prueba configurado | Llega el correo, remitente = cuenta del negocio |
| 5 | Responder a ese correo | La respuesta llega a la bandeja del negocio |
| 6 | Usuario sin rol admin abre la pantalla | `403`, no ve ni la máscara |
| 7 | Seis pruebas en un minuto | La sexta da `429` |
| 8 | Master key ausente al guardar | Error explícito; **no** se guarda en claro |
| 9 | Alterar un byte del ciphertext en la BD | El descifrado falla (GCM detecta la manipulación); cae al respaldo de entorno |
| 10 | Tenant A intenta leer la config del tenant B | Cero filas |

---

## 13 · Gotchas reales

Cosas que costaron tiempo en DermaLand. Léelas antes de depurar.

1. **La contraseña de aplicación viene con espacios.** Google la muestra como
   `abcd efgh ijkl mnop`. Hay que hacer `.replace(/\s+/g, "")` **en los tres
   puntos**: al validar, al cifrar y al enviar. Si se te escapa uno, el fallo es
   un `535 Authentication failed` de Gmail que no dice nada de espacios.

2. **La contraseña de aplicación exige Verificación en 2 pasos activa.** Si la
   cuenta no la tiene, la opción "Contraseñas de aplicaciones" **no aparece** en
   Google — el usuario reporta "no existe esa pantalla". Ponlo en el texto de
   ayuda de la UI.

3. **No es la contraseña normal de Gmail.** Un porcentaje real de usuarios pega
   la de su cuenta. El error de Gmail es el mismo `535` genérico.

4. **Tope de envío de Gmail:** ~500 destinatarios/día en cuentas gratuitas
   (2 000 en Workspace). Al superarlo, Gmail bloquea la cuenta temporalmente
   (~24 h). Para envío masivo, este módulo **no** es la herramienta.

5. **El limitador de tasa es en memoria y por instancia.** En serverless, con
   varias instancias calientes, el tope efectivo es *N × límite*. Sirve contra el
   abuso ingenuo; para un tope estricto hay que cablear Redis detrás de la misma
   interfaz `rateLimit(...)`, sin tocar las llamadas.

6. **`catch` vacío en la resolución de credenciales.** Si el descifrado falla,
   el sistema envía desde la cuenta del entorno **en silencio**. Añade un log
   (sin secretos) al portar.

7. **Comentarios obsoletos en el código origen.** La cabecera de
   `proformas/[id]/share/email/route.ts` dice "(Resend)" y menciona
   `RESEND_API_KEY`: es un resto de una implementación anterior. **El módulo usa
   nodemailer + Gmail SMTP.** No busques Resend, no está.

8. **La tabla puede no estar en los tipos generados.** En DermaLand
   `email_settings` no está en `database.types.ts`, y el servicio castea el
   cliente a `SupabaseClient` sin tipar. Funciona, pero pierdes seguridad de
   tipos: regenera los tipos tras la migración.

9. **La auditoría va en `try/catch` y después del envío.** Si auditar falla, el
   correo **ya salió** — no puede "des-enviarse". Registrar el fallo, nunca
   propagarlo.

10. **`import "server-only"` en todo archivo que toque secretos.** Es la única
    barrera que impide que un `import` descuidado desde un componente de cliente
    filtre la lógica de credenciales al bundle del navegador. Falla en build, que
    es exactamente donde quieres enterarte.

---

## Anexo · Origen de cada pieza en DermaLand

Para consultar el código real:

```
apps/web/src/
├── server/services/email/gmail.ts                     § 8
├── server/services/email/email-settings-service.ts    § 4, 7
├── server/crypto/ai-cipher.ts                         § 5
├── server/security/rate-limit.ts                      § 6.3
├── app/api/settings/email/route.ts                    § 6.1, 6.2
├── app/api/settings/email/test/route.ts               § 6.3
├── app/(app)/admin/configuracion/correo/page.tsx      § 10
├── app/api/proformas/[id]/share/email/route.ts        § 6.4  (caso de uso)
└── features/sales/invoice-email-html.ts               § 9

supabase/migrations/0034_email_settings.sql            § 4.1
```
