# Auditoría integral de seguridad — DermaLand

**Fecha:** 2026-07-12 · **Commit base:** `4f784a1` · **Alcance:** `apps/web`
(Next.js) + Supabase/PostgreSQL, arquitectura multiempresa (`business_id`).
**Método:** revisión del código, migraciones y políticas RLS reales + 4 barridos
de auditoría paralelos. **Sin despliegue a producción** (Fase 30 del encargo).

> Documento canónico. Complementos: [`rls-matrix.md`](./rls-matrix.md),
> [`threat-model.md`](./threat-model.md),
> [`deployment-security-checklist.md`](./deployment-security-checklist.md).

## A. Resumen ejecutivo

- **Aislamiento multiempresa (RLS):** sólido por diseño — **las 56 tablas tienen
  RLS habilitado** y filtran por `business_id = auth_business_id()`. Las únicas
  políticas `USING(true)` son SELECT sobre catálogos globales (permisos, roles,
  planes) — correcto. No hay funciones `SECURITY DEFINER` en `public`.
- **Riesgo principal encontrado (CRÍTICO):** los claims de autorización se
  derivaban de `user_metadata` (escribible por el propio usuario) → escalada a
  Súper Admin y salto de tenant (**SEC-001**). **Corregido** en la capa de app;
  migración RLS lista (pendiente de aplicar a prod, ver §E).
- **Segundo crítico:** la emisión de venta persistía los totales del cliente sin
  recomputar (**SEC-002**). **Corregido** (recompute server-side).
- **Nivel de preparación para producción:** **APTO CON OBSERVACIONES.** Los dos
  críticos están corregidos en código; quedan altos/medios de robustez
  (autorización por rol en algunas rutas de dinero, atomicidad de stock,
  idempotencia de emisión, firma de webhook) — ninguno bloquea el aislamiento
  multiempresa pero deben cerrarse antes de operación multi-tenant real.

## B. Inventario técnico (superficie de ataque)

- **Framework:** Next.js (App Router) en monorepo pnpm; app en `apps/web`.
- **Auth/DB:** Supabase Auth (cookies httpOnly vía `@supabase/ssr`) + PostgreSQL
  con RLS. `DATA_SOURCE=supabase` en prod.
- **Superficie:** ~90 páginas, API routes bajo `app/api/**`, Server Actions,
  `middleware.ts`, webhook WhatsApp (`/api/whatsapp/webhook`), sync offline
  (`/api/inventory-counts/sync`), PDF compartido con service-role
  (`/api/proformas/[id]/pdf`).
- **Servicios externos:** Supabase, Vercel, OpenAI (módulo IA), WhatsApp Cloud
  API (parcial), DGII e-CF (en desarrollo).
- **Datos sensibles:** clientes (nombre/teléfono/documento/tipo de piel/compras),
  montos financieros, secuencias fiscales/NCF, certificados `.p12` DGII, API
  keys de IA, conversaciones.
- **Límites de confianza:** navegador (no confiable) → API/Server (deriva tenant
  del JWT) → RLS (defensa final por `business_id`).

## C. Hallazgos

| ID | Sev | Área | Problema | Estado | Archivo |
|----|-----|------|----------|--------|---------|
| SEC-001 | **CRÍTICO** | Auth/RBAC/Tenant | Claims (`business_id`,`role`,`is_platform_admin`) leídos de `user_metadata` (user-writable) → escalada a Súper Admin / salto de tenant | **Corregido (app) · migración RLS pendiente de aplicar** | `server/auth/context.ts`, `middleware.ts`, `supabase/migrations/0006…`, script bootstrap |
| SEC-002 | **CRÍTICO** | POS/Finanzas | Emisión de venta persiste subtotal/ITBIS/total/precio del cliente sin recomputar (la edición sí recomputaba) | **Corregido** | `server/repositories/supabase/sales.ts` |
| SEC-003 | **ALTO** | Secretos/IDOR | Token de PDF compartido con secreto fallback embebido + lectura service-role (bypassa RLS) → forjar tokens = leer PDFs de otra empresa | **Corregido (fail-closed)** | `server/services/sales/share-token.ts` |
| SEC-004 | **ALTO** | Webhooks | Webhook WhatsApp no verifica firma `X-Hub-Signature-256` (hoy stub sin persistencia) | **Pendiente** (cerrar antes de persistir) | `app/api/whatsapp/webhook/route.ts` |
| SEC-005 | **MEDIO** | Endurecimiento | Faltaban cabeceras de seguridad HTTP (clickjacking, MIME sniffing, HSTS) | **Corregido** (sin CSP estricta aún) | `next.config.ts` |
| SEC-006 | **MEDIO** | RBAC | `approve/reject` de conteo físico sin gate de rol (segregación de funciones) | **Pendiente** (parche trivial) | `app/api/inventory-counts/[id]/route.ts` |
| SEC-007 | **MEDIO** | RBAC/Finanzas | Rutas de dinero/fiscal solo exigen sesión, no rol: `incentives/pay` (**corregido**), `incentives/rules`, `commission/*`, `dgii/sequences*`, subida de certificado `.p12` | **Parcial** (pay corregido; resto pendiente, patrón idéntico) | ver §D |
| SEC-008 | **MEDIO** | IDOR (defensa) | Updates/deletes filtrados solo por `id` (dependen 100% de RLS), sin `.eq(business_id)` explícito | **Parcial** (pay corregido) | `users/[id]`, `dgii/sequences/[id]`, `incentives/rules/[id]` |
| SEC-009 | **MEDIO** | POS | `saveDgiiSettings` (Server Action) sin auth y con `businessId` hardcodeado (`DEMO_BUSINESS_ID`) | **Pendiente** | `app/(app)/dgii/configuracion/actions.ts` |
| SEC-010 | **ALTO** | POS/Inventario | Descuento de stock NO atómico (UPDATE absoluto desde snapshot del cliente, sin `WHERE current_quantity >= n`) → sobreventa por carrera; y desacoplado de la emisión | **Pendiente** (requiere RPC transaccional + confirmación) | `app/api/lots/[id]/route.ts`, `product.ts` |
| SEC-011 | **ALTO** | POS | Sin idempotencia/anti doble-submit en la emisión → doble factura y doble NCF por reintento | **Pendiente** | `app/api/proformas/route.ts` |
| SEC-012 | **MEDIO** | POS | Sin tope de descuento por rol (solo clamp de UI 0–100; un POST directo lo evade) | **Parcial** (recompute clampa a 100% y deriva montos; falta tope por rol) | `sales.ts`, `features/billing/permissions.ts` |
| SEC-013 | **MEDIO** | POS/RBAC | `action:"cancel"` de proforma no valida rol (sí valida tenant) | **Pendiente** | `app/api/proformas/[id]/route.ts` |
| SEC-014 | **BAJO** | SSRF | `baseUrl` de proveedor IA arbitrario (solo admin de la empresa; compromete su propia key) | **Pendiente** (allowlist opcional) | `app/api/ai/providers/route.ts` |
| SEC-015 | **MEDIO** | IA | Presupuesto con TOCTOU + sin rate-limit por minuto (DoS económico acotado al tope mensual) | **Pendiente** | `server/services/ai/provider-service.ts` |
| SEC-016 | **BAJO** | Auditoría | `scanned_by`/`scanned_by_name` del sync offline los fija el cliente (no cruza tenant) | **Pendiente** | `app/api/inventory-counts/sync/route.ts` |
| SEC-017 | **BAJO/INFO** | DGII demo | Rutas DGII demo sin sesión operan sobre mocks; gatear antes de conectar a datos reales | **Aceptado (pre-Fase C)** | `app/api/dgii/**` (facturas/preview/certificacion) |

### Áreas verificadas como BIEN protegidas (defensas reales)

- **RLS** habilitado en las 56 tablas; `auth_business_id()`/`auth_is_platform_admin()`
  con `search_path` fijo; sin `SECURITY DEFINER` en `public`.
- **`.env` gitignoreado**; ningún `.env` real commiteado; solo `.env.example` con
  placeholders. **Sin secretos hardcodeados** reales; sin `NEXT_PUBLIC_*` con
  secretos; `service_role` estrictamente server-only (nunca en `"use client"`).
- **Sin patrones peligrosos:** 0 `dangerouslySetInnerHTML`, `eval`, `new Function`,
  `child_process`; sin CORS `*`; sin logging de datos sensibles; inyección de
  filtros PostgREST mitigada (`sanitizeTerm`).
- **Certificados DGII:** AES-256-GCM en reposo, validación de extensión/tamaño,
  wipe del buffer, nunca al frontend.
- **IA:** API keys cifradas AES-256-GCM, descifradas solo en servidor, nunca
  devueltas; todos los `/api/ai/*` con `requireAiUser/Admin`; sin mass assignment;
  tools con efecto NO cableadas al LLM hoy; system prompt fijo server-side.
- **Sesión** en cookies httpOnly (no localStorage); JWT no expuesto.
- **Sync offline idempotente** (índice único `device_id`+`offline_scan_id`).
- **Edición de venta y numeración NCF:** recomputada server-side, gate por rol,
  atómica (RPC `reserve_invoice_number`), auditada; identidad/tenant del JWT.
- **Sin mass assignment:** todas las escrituras usan objetos de campos explícitos.

## D. Cambios realizados (parches mínimos, compatibles, trazables)

| Archivo | Motivo | Riesgo corregido | Compat. | Prueba |
|---|---|---|---|---|
| `server/auth/auth-claims.ts` (nuevo) + `context.ts` | Leer claims de `app_metadata`, no `user_metadata` | SEC-001 | Transparente (usuarios ya tienen los claims en app_metadata) | `context.test.ts` (3) |
| `middleware.ts` | Gate super-admin usa `app_metadata` | SEC-001 | Transparente | idem |
| `scripts/bootstrap-preview-supabase-user.mjs` | Claims sensibles solo a `app_metadata`; `user_metadata` solo `full_name` | SEC-001 | Compatible | — |
| `supabase/migrations/0026_…` (nuevo, NO aplicado) | Quitar fallback a `user_metadata` en helpers RLS | SEC-001 (DB) | No bloquea usuarios legítimos | pendiente (§E) |
| `server/repositories/supabase/sales.ts` | Recompute server-side de montos+ítems al emitir (motor `recalcInvoice`) | SEC-002 | Transparente para ventas legítimas | `sales-emit-recompute.test.ts` (4) |
| `server/services/sales/share-token.ts` | Exigir `DOCUMENT_SHARE_SECRET` fuerte (fail-closed) | SEC-003 | Requiere setear la env var | `share-token.test.ts` (5) |
| `next.config.ts` | Cabeceras de seguridad (nosniff, DENY, HSTS, Referrer/Permissions-Policy) | SEC-005 | Compatible (camera=self para PWA) | build |
| `app/api/incentives/pay/route.ts` | Gate `isBillingAdmin` + `.eq(business_id)` | SEC-007/008 | Compatible | — |
| `.env.example` | Documentar `DOCUMENT_SHARE_SECRET` | SEC-003 | — | — |

**Rutas pendientes de gate de rol (SEC-007, patrón idéntico al de `incentives/pay`):**
`app/api/incentives/rules/route.ts` + `[id]`, `app/api/commission/{rules,rules/[id],payouts,batches,exclusions}/route.ts`,
`app/api/dgii/sequences/route.ts` + `[id]` + `[id]/activate`, `features/dgii/certificate-actions.ts` (uploadCertificate),
`app/api/inventory-counts/[id]/route.ts` (approve/reject, SEC-006), `app/api/proformas/[id]/route.ts` (cancel, SEC-013).
Cada uno: importar el helper de `features/billing/permissions.ts` y añadir un check `if (!isBillingAdmin(session.user.role)) return 403` + `.eq("business_id", session.businessId)`.

## E. Cambios de producción pendientes de confirmación (Fase 30)

**Migración RLS `0026_sec001_auth_helpers_appmeta_only.sql`** — quita el fallback
a `user_metadata` en `auth_business_id()`/`auth_is_platform_admin()`.

- **Riesgo:** BAJO. Ambos usuarios actuales tienen `business_id` e
  `is_platform_admin` en `app_metadata` (verificado). No bloquea a nadie.
- **Respaldo/reversión:** reaplicar `0006` restaura el fallback. Aditiva
  (`CREATE OR REPLACE`), no toca tablas ni datos.
- **Pruebas superadas:** typecheck, 1712 tests, build.

**Limpieza de `user_metadata` de usuarios existentes** (opcional, endurecimiento):
borrar `business_id`/`role`/`is_platform_admin` de `raw_user_meta_data`. Toca
`auth.users` en prod → requiere confirmación explícita.

## F. Resultados de pruebas

| Comando | Resultado |
|---|---|
| `vitest run` (suite completa) | **1712 tests · 155 files**, todos verdes (un `report-pdf` flaky bajo carga paralela pasa aislado 11/11) |
| `tsc --noEmit` | limpio |
| `next build` | compila OK (rutas + cabeceras) |
| Tests de seguridad nuevos | `context.test.ts` (SEC-001, 3), `sales-emit-recompute.test.ts` (SEC-002, 4), `share-token.test.ts` (SEC-003, 5) |
| RLS (MCP) | 56/56 tablas con RLS; 0 `USING(true)` en tablas de tenant; 0 `SECURITY DEFINER` en public |

## G. Riesgos pendientes (priorizados)

1. **SEC-010 (ALTO)** descuento de stock no atómico → sobreventa. Requiere RPC
   `decrement_lot_stock(WHERE current_quantity >= n)` transaccional + acoplar a
   la emisión. Necesita diseño + confirmación (toca inventario real).
2. **SEC-011 (ALTO)** idempotencia de emisión → doble factura/NCF. Añadir clave
   de idempotencia por (sesión, cliente, monto, ventana) o `Idempotency-Key`.
3. **SEC-004 (ALTO)** firma HMAC del webhook WhatsApp — cerrar antes de persistir.
4. **SEC-007/006/013 (MEDIO)** gates de rol restantes (parche trivial, en lote).
5. **SEC-009 (MEDIO)** auth + tenant real en `saveDgiiSettings`.
6. **SEC-012/015/014/016** endurecimientos (tope de descuento por rol, rate-limit
   IA, allowlist SSRF, atribución de escaneo).

## H. Veredicto

**APTO CON OBSERVACIONES.** El aislamiento multiempresa (RLS) es sólido y los dos
riesgos críticos (escalada de privilegios por `user_metadata` y manipulación de
totales al emitir) están **corregidos en código**. Antes de operar con **varias
empresas reales y dinero real** debe: (1) aplicarse la migración RLS `0026`;
(2) cerrarse SEC-010/011 (atomicidad de stock e idempotencia de emisión);
(3) completarse los gates de rol restantes (SEC-006/007/013) y la firma del
webhook (SEC-004). Con eso, apto para producción multi-tenant.
