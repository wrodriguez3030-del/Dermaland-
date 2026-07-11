# Módulo de Proveedores de IA — DermaLand

Módulo seguro y multi-empresa para conectar DermaLand con proveedores de IA
(empezando por **OpenAI**), asignarlos a los agentes y controlar uso/costos.
Preparado para agregar proveedores futuros sin reescribir agentes ni tools.

> **ChatGPT (app) ≠ API de OpenAI.** Este módulo usa una **clave de la
> plataforma API de OpenAI** (`platform.openai.com`). No se inventa ninguna clave.

## 1. Arquitectura

```
UI (/ia/proveedores, /ia)                 ← ADMIN configura; NUNCA ve la clave
   │  fetch /api/ai/*
API routes (server, gated + permisos + RLS)
   │
AIProviderService (capa central)          ← descifra la clave SOLO aquí
   ├─ store.ts        (Supabase: providers/secrets/bindings/usage)
   ├─ ai-cipher.ts    (AES-256-GCM)
   └─ providers/      (adaptadores)
        ├─ AIProviderAdapter (interfaz canónica)
        ├─ OpenAIProviderAdapter (Responses API)  + "openai_compatible"
        └─ factory.ts / pricing.ts
```

Los **agentes y tools nunca llaman a un SDK/HTTP de proveedor directamente** —
todo pasa por `AIProviderService`. Agregar un proveedor = implementar un
`AIProviderAdapter` + un `case` en `factory.ts`.

## 2. Proveedores

- **OpenAI** — implementado (Responses API, streaming preparado, tools/function
  calling, usage, timeout, rate limit, errores amigables).
- **Compatible con OpenAI** — implementado (misma API, `base_url` propia).
- **Anthropic / Google Gemini / Modelo local** — "próximamente" (no se muestran
  como conectados hasta tener adaptador funcional).

## 3. Cifrado de credenciales

- Algoritmo: **AES-256-GCM** (`server/crypto/ai-cipher.ts`, Web Crypto).
- Master key: **`AI_CREDENTIALS_ENCRYPTION_KEY`** (base64 de 32 bytes) — SOLO en
  variables de entorno del servidor. Nunca se imprime ni loguea.
- Se guardan por separado en `ai_provider_secrets`: `encrypted_api_key`, `iv`,
  `auth_tag`, `encryption_version`, `key_last_four`.
- Descifrado **únicamente en el servidor**, justo antes de llamar al proveedor.
- **Sin la master key NO se guarda ninguna clave** (se bloquea con mensaje
  administrativo; nunca en texto plano).

## 4. La API key nunca llega al navegador

- Es **write-only**: el cliente la envía una vez (`POST /providers` o
  `/rotate-key`); el servidor la cifra y **jamás la devuelve**.
- Las vistas (`AiProviderView`) exponen solo `keyLastFour` → se muestra
  `••••••••••••abcd` (`maskApiKey`).
- No se guarda en `localStorage`, ni en HTML, logs, errores o respuestas.
- Los mensajes de error son amigables y no incluyen la clave ni la respuesta
  cruda del proveedor (ver `api-helpers.ts` y `openai-adapter.ts#friendlyError`).

## 5. Variables de entorno

```env
AI_CREDENTIALS_ENCRYPTION_KEY=   # base64 de 32 bytes (openssl rand -base64 32)
OPENAI_API_KEY=                  # opcional: clave GLOBAL de fallback (legacy)
```

`AI_CREDENTIALS_ENCRYPTION_KEY` es **obligatoria** para guardar credenciales por
empresa desde la UI. Si se usa solo la configuración por-UI, `OPENAI_API_KEY`
global es opcional.

## 6. Modelo de datos (Supabase, RLS por `business_id`)

- `ai_providers` — config del proveedor (tipo, nombre, estado, base_url,
  modelos por rol, límites, timeouts, flags, resultado de última prueba).
- `ai_provider_secrets` — clave cifrada (1 por proveedor; rotación reemplaza).
- `ai_agent_provider_bindings` — proveedor/modelo/fallback/estado por agente.
- `ai_usage_logs` — 1 fila por solicitud: tokens, costo estimado, latencia,
  tools, estado, error resumido, fallback.

Todas con RLS `business_id = auth_business_id()`. El `business_id` **siempre**
sale de la sesión (JWT), nunca del body. `service_role` no se expone.

## 7. Adaptadores

`AIProviderAdapter`: `testConnection`, `listModels`, `createResponse`,
`streamResponse`, `calculateEstimatedCost`. La API key llega descifrada por
parámetro y no se persiste.

## 8. Tools

Se clasifican en **solo lectura** (productos, inventario, lotes, clientes,
diferencias, vencimientos) y **con efecto** (WhatsApp, crear/modificar, ajustes,
compras, eliminar, emitir). Las de efecto requieren permiso + validación de
`business_id`/`branch_id`/rol + auditoría + confirmación cuando aplica. En **modo
de prueba** los agentes se ejecutan **sin tools de efecto**. La IA nunca accede
directo a Supabase: llama funciones controladas y tipadas.

## 9. Límites y presupuestos

Por proveedor (`monthly_request_limit`, `monthly_budget_usd`). `AIProviderService`
consulta `ai_usage_logs` del mes y **bloquea** al alcanzar el tope (o usa fallback
según config). Mensaje: "Se alcanzó el límite mensual configurado."

## 10. Fallback

Se ejecuta **solo** por causas retriables (timeout, rate limit, proveedor no
disponible, modelo no disponible). **No** para validación, permisos, tool no
autorizada ni límite mensual. Se registra el fallo del principal, el motivo, el
fallback usado y su costo.

## 11. Logs y costos

`GET /api/ai/usage` y las filas de `ai_usage_logs`. No se guardan API keys ni
datos sensibles innecesarios (configurable: enmascarar cédula/teléfono/email, no
guardar contenido del prompt, retención).

## 12. Permisos / RLS

ADMIN (rol `admin`/`manager` o platform-admin) configura proveedores, asigna
modelos, ve uso y administra límites. Usuario autorizado usa agentes pero **no ve
la API key** ni cambia proveedores. Guard server-side en `guard.ts`
(`requireAiAdmin` / `requireAiUser`).

## 13. Endpoints

`GET/POST /api/ai/providers` · `GET/PATCH/DELETE /api/ai/providers/[id]` ·
`POST /api/ai/providers/[id]/test` · `GET /api/ai/providers/[id]/models` ·
`POST /api/ai/providers/[id]/rotate-key` · `GET /api/ai/agents` ·
`PATCH /api/ai/agents/[id]` · `POST /api/ai/agents/[id]/test` ·
`GET /api/ai/usage`. Todos: sesión + permisos + tenant + gating Supabase (409 en
modo local) + errores amigables.

## 14. Rotación de claves

`POST /api/ai/providers/[id]/rotate-key` con `{ apiKey }` → cifra y reemplaza el
secreto (upsert por `provider_id`, `rotated_at`). La clave anterior no se
conserva.

## 15. Procedimiento para conectar OpenAI (ADMIN, sin tocar código)

1. Configurar `AI_CREDENTIALS_ENCRYPTION_KEY` en Vercel (Production).
2. IA → **Proveedores de IA** → **Conectar proveedor** → OpenAI.
3. Pegar la API key de `platform.openai.com` → **Probar conexión**.
4. Elegir modelos → definir límites → **Guardar y activar**.
5. IA → **Agentes IA**: asignar proveedor/modelo a cada agente → **Probar
   agente** → **Activar**.
6. Revisar consumo en **Logs y costos**.

## 16. Estado inicial seguro

Tras el despliegue, ningún proveedor queda activo con clave ficticia. OpenAI
aparece **"Sin configurar"** y los agentes muestran **"Configuración pendiente"**
hasta que un ADMIN agregue y pruebe una clave real. No se realizan solicitudes
hasta entonces. No bloquea otras funciones de DermaLand.
