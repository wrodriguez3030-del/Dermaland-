# Enlace de Azul por pedido — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada pedido de tarjeta lleva SU enlace de Link de Pagos de Azul (con el monto exacto), pegado por el admin; el enlace fijo de la configuración deja de enseñarse al cliente.

**Architecture:** Columna nueva en `web_orders` + servicio y ruta de mutación con sesión/rol (patrón de `/api/pedidos-web/[id]/estado`) + formulario en el detalle del ERP + la página pública del pedido usa el enlace del pedido, no el del negocio. Regla pura probada para quién admite enlace.

**Tech Stack:** Next.js 15 App Router · Supabase (service-role en servidor) · zod · Vitest.

## Global Constraints

- Español es-DO en todo texto visible; etiquetas legibles en auditoría (nunca claves/UUID).
- Toda query filtra por `business_id`; la ruta exige sesión + `WEB_ORDER_MANAGE_ROLES`.
- Un fallo de correo NUNCA deshace un guardado.
- Validar el dominio del enlace en cliente Y servidor con `normalizeAzulPaymentLink` (solo `https://pagos.azul.com.do`).
- Antes de commitear: `pnpm --filter web typecheck` + `test` + `build` verdes.
- SemVer + CHANGELOG obligatorios al cerrar (v0.132.0).

---

### Task 1: Regla pura `canSetAzulLink`

**Files:**
- Modify: `apps/web/src/features/storefront/azul-link.ts`
- Test: `apps/web/src/features/storefront/azul-link.test.ts`

**Interfaces:**
- Produces: `canSetAzulLink(pedido: {paymentMethod: "efectivo"|"transferencia"|"tarjeta"; paymentStatus: "pendiente"|"pagado"|"reembolsado"; status: string}): {ok: true} | {ok: false; error: string}`

- [ ] Test primero (falla), casos: tarjeta+pendiente+recibido → ok; efectivo → "Este pedido no se paga con tarjeta."; pagado → "Este pedido ya está pagado."; cancelado → "Este pedido está cancelado."; reembolsado → ok (se puede volver a cobrar tras un reembolso NO aplica: reembolsado también se rechaza con "Este pedido fue reembolsado.").
- [ ] Implementación mínima; correr `pnpm --filter web test azul-link`; commit `feat(tienda): regla de qué pedido admite enlace de Azul`.

### Task 2: Migración `web_orders.azul_payment_link_url`

**Files:**
- Create: `supabase/migrations/20260819180000_web_orders_azul_link.sql`
- Modify: `apps/web/src/server/db/database.types.ts` (web_orders Row/Insert/Update)

```sql
-- Enlace de Link de Pagos de Azul generado PARA ESTE PEDIDO (monto exacto).
-- NULL = todavía no se generó. El del negocio (business_web_settings) es solo
-- el interruptor de "acepta tarjeta"; al cliente se le enseña ESTE.
alter table public.web_orders
  add column if not exists azul_payment_link_url text;
```

- [ ] Invocar la skill `database-migration-safety` antes de aplicar.
- [ ] Aplicar a producción igual que la 20260819120000 (mismo mecanismo y registro en `schema_migrations` — mirar cómo quedó registrada esa y calcar).
- [ ] Añadir la columna a `database.types.ts`; typecheck; commit.

### Task 3: Servidor — leer y guardar el enlace del pedido

**Files:**
- Modify: `apps/web/src/features/storefront/orders/types.ts` (`WebOrder.azulPaymentLinkUrl?: string`)
- Modify: `apps/web/src/server/services/storefront/orders.ts` (`findWebOrderByToken`, `getWebOrderForBusiness`: select + map; servicio nuevo)

**Interfaces:**
- Produces: `setWebOrderAzulLink(businessId: string, id: string, urlEscrita: string): Promise<{ok: true; url: string|null; number: string; contactEmail?: string} | {ok: false; error: string}>`
  — normaliza con `normalizeAzulPaymentLink`, aplica `canSetAzulLink` contra el pedido real, guarda (`null` si vacío = borrar).

- [ ] Añadir campo al tipo y a los dos selects/maps.
- [ ] Servicio con la regla; typecheck; commit.

### Task 4: Correo "Tu enlace de pago está listo"

**Files:**
- Modify: `apps/web/src/server/services/storefront/order-notify.ts`

**Interfaces:**
- Produces: `notifyOrderPaymentLink(input: {businessId: string; orderId: string; orderNumber: string; contactEmail?: string; siteName: string}): Promise<NotifyOutcome>` — mismo riel Gmail y `renderHtml`; texto: ya puedes pagar con tarjeta, el enlace lleva el monto exacto, con la URL del pedido (token firmado).

- [ ] Implementar calcando `notifyOrderStatus` (sin correo → `sin-correo`, etc.); commit.

### Task 5: Ruta `POST /api/pedidos-web/[id]/azul-link`

**Files:**
- Create: `apps/web/src/app/api/pedidos-web/[id]/azul-link/route.ts` (calcar `estado/route.ts`)

- [ ] `authorizeRole(WEB_ORDER_MANAGE_ROLES)` + zod `{url: z.string().trim().max(500)}` + `setWebOrderAzulLink`.
- [ ] Si guardó URL no nula y hay correo → `notifyOrderPaymentLink` (fallo no bloquea).
- [ ] Auditoría `web_order.azul_link_set`, metadata legible `{enlace: url ?? "borrado", aviso_al_cliente}`; commit.

### Task 6: Admin — formulario en el detalle del pedido

**Files:**
- Create: `apps/web/src/features/storefront/components/admin/order-azul-link-form.tsx`
- Modify: `apps/web/src/app/(app)/pedidos-web/[id]/page.tsx` (dentro de la Card de pago, cuando `paymentMethod==="tarjeta" && paymentStatus!=="pagado" && status!=="cancelado"`)

- [ ] Componente cliente: monto exacto copiable (`amountRaw`) + número de pedido, campo para pegar el enlace (validación en cliente con `normalizeAzulPaymentLink`), Guardar → POST, "Quitar enlace" cuando hay uno (POST con url vacía, `confirm`), errores visibles, `router.refresh()` al guardar.
- [ ] Enseñar el enlace vigente (o "sin enlace todavía"); commit.

### Task 7: Cliente — la página del pedido usa el enlace del pedido

**Files:**
- Modify: `apps/web/src/features/storefront/components/azul-pay-box.tsx` (fuera `amountRaw`; el texto pasa de "teclea el monto" a "verifica que diga RD$X; si no coincide, no pagues y escríbenos")
- Modify: `apps/web/src/app/tienda/pedido/[token]/page.tsx` (usar `pedido.azulPaymentLinkUrl`; sin enlace → aviso "Estamos preparando tu enlace de pago…" + subidor de comprobante igual; ya no se usa `tenant.azulPaymentLinkUrl` aquí)

- [ ] Rehacer AzulPayBox y la sección tarjeta; commit.

### Task 8: Checkout y configuración — textos honestos

**Files:**
- Modify: `apps/web/src/features/storefront/components/checkout-view.tsx` (los dos textos de tarjeta: el enlace con el monto exacto llega en la página del pedido / por correo)
- Modify: `apps/web/src/features/storefront/components/admin/storefront-settings-form.tsx` (ayuda del campo: activa la opción; el enlace de cada pedido se pega en el pedido)

- [ ] Ajustar textos; commit.

### Task 9: Validación, documentación y versión

- [ ] `pnpm --filter web typecheck` + `test` (suite completa) + `build`.
- [ ] v0.132.0: `package.json`, `CHANGELOG.md`, `docs/estado-actual.md`, `docs/decisiones.md` (por qué el enlace es por pedido), `docs/pagos-en-linea.md` §0.
- [ ] Commit final de docs.
