# DermaLand · Variables de entorno

Lista canónica de variables. Plantilla en `.env.example`. Copiar a `.env`
local; en producción setear vía Vercel / proveedor de hosting.

## Convenciones

- Variables con prefijo `NEXT_PUBLIC_` se exponen al **cliente**. **No poner secretos** ahí.
- Variables sin prefijo solo están disponibles server-side (Server Components, Server Actions, Route Handlers, Edge Functions).
- Nunca commitear `.env` con valores reales.

## Tabla

| Variable | Visibilidad | Requerida en | Descripción |
|---|---|---|---|
| `NODE_ENV` | server | siempre | `development` / `production` / `test` |
| `NEXT_PUBLIC_APP_URL` | público | siempre | Base URL pública (https://app.dermaland.do en prod) |
| `APP_URL` | server | siempre | Igual a la anterior — usado en server actions y emails |
| `DATA_SOURCE` | server | siempre | `mock` (default) o `supabase` |
| `NEXT_PUBLIC_SUPABASE_URL` | público | si `DATA_SOURCE=supabase` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | público | ídem | Anon key — RLS es el límite de seguridad |
| `SUPABASE_SERVICE_ROLE_KEY` | **server** | ídem | Bypassea RLS · solo server actions específicas |
| `DATABASE_URL` | server | migraciones / scripts | Connection string Postgres directo |
| `JWT_SECRET` | server | recomendado | 32+ chars aleatorios para firma de cookies internas |
| `SESSION_COOKIE_NAME` | server | opcional | Default `dermaland-session` |
| `DGII_ENVIRONMENT` | server | Fase 5 | `cert` o `prod` |
| `DGII_CERTIFICATE_PATH` | server | Fase 5 | Ruta o key en Supabase Storage |
| `DGII_CERTIFICATE_PASSWORD` | server | Fase 5 | **Cifrar con KMS antes de almacenar** |
| `WHATSAPP_ACCESS_TOKEN` | server | Fase 6 | Token de la app Business en Meta |
| `WHATSAPP_PHONE_NUMBER_ID` | server | Fase 6 | ID del número verificado |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | server | Fase 6 | WABA ID |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | server | Fase 6 | Token elegido por nosotros — Meta lo valida en handshake |
| `OPENAI_API_KEY` | server | Fase 7 | Scope mínimo: `chat.completions` |
| `OPENAI_DEFAULT_MODEL` | server | Fase 7 | Default `gpt-4o-mini` |
| `OPENAI_FALLBACK_MODEL` | server | opcional | Default `gpt-4o` para casos complejos |
| `ANTHROPIC_API_KEY` | server | opcional | Secondary, para evaluación |
| `RESEND_API_KEY` | server | Fase 5+ | Email transaccional |
| `SENTRY_DSN` | server | producción | Backend errors |
| `NEXT_PUBLIC_SENTRY_DSN` | público | producción | Frontend errors |
| `UPSTASH_REDIS_URL` | server | Fase 6+ | Cache + rate limit |
| `UPSTASH_REDIS_TOKEN` | server | ídem | |

## Helpers

`src/lib/env.ts` valida con Zod. Funciones disponibles:

```ts
import {
  env,
  isSupabaseConfigured,
  isDgiiConfigured,
  isWhatsappConfigured,
  isOpenAIConfigured,
} from "@/lib/env";

if (isSupabaseConfigured()) {
  const sb = await createServer();
  // ...
}
```

En `development` la validación es permisiva: variables faltantes se reemplazan
por defaults razonables. En `production` faltantes hard-fail al boot.

## Compartir entre PCs

**No** vía Drive ni Git. Usar gestor de contraseñas (1Password / Bitwarden)
con un ítem compartido `DermaLand .env` que guarde el contenido completo
del archivo. En cada PC: copiar y pegar.
