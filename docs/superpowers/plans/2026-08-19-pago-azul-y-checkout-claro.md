# Pago con enlace Azul + campos pendientes claros — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ofrecer "Tarjeta (enlace seguro de Azul)" como método de pago del pedido web —con confirmación manual por comprobante, igual que la transferencia— y que el checkout marque con claridad los campos que faltan al enviar.

**Architecture:** El enlace de Azul vive en `business_web_settings` (columna nueva, fail-closed: sin enlace no hay opción). El flujo reutiliza el riel de la transferencia: el pago se hace en `/tienda/pedido/[token]`, el cliente sube comprobante (`ReceiptUpload`), el admin lo acepta en *Ventas → Pedidos web* y eso marca `pagado`. La regla de campos faltantes es una función pura con prueba (patrón `checkout-fulfillment.ts`).

**Tech Stack:** Next.js 15 App Router · React 19 · TypeScript estricto · Tailwind 4 · Supabase (PostgREST + migraciones vía MCP) · Vitest · pnpm.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-19-pago-azul-y-checkout-claro-design.md`.
- El enlace solo se acepta si es `https://pagos.azul.com.do/...` (rechazar todo lo demás).
- Nada marca un pedido como `pagado` automáticamente; solo la revisión del admin.
- No tocar `registry.ts`, `paymentsEnabled()`, variables `AZUL_*` ni `PAYMENTS_PROVIDER`.
- `payment_method` en BD es `text`; el valor nuevo es exactamente `'tarjeta'` (la lectura ya lo mapea).
- Sin `NEXT_PUBLIC_*` nuevas. Sin librerías nuevas.
- Toda ruta nueva bajo `/tienda` que no lea `searchParams` lleva `export const dynamic = "force-dynamic"` (aquí no se crean rutas nuevas).
- Comandos: `pnpm --filter web typecheck` · `pnpm --filter web test` · `pnpm --filter web build`. Prueba puntual: `pnpm --filter web exec vitest run <ruta relativa a apps/web>`.
- Commits pequeños en `main` SIN push: **push a main = producción**; el push lo autoriza el usuario al final.
- Migración a prod (`sntcvyozbhrgicwmtcoh`) vía MCP `apply_migration` — es aditiva y nullable; cargar la skill `production-change-control` antes de aplicarla.

---

### Task 1: Migración `azul_payment_link_url` + tipos de BD

**Files:**
- Create: `supabase/migrations/20260819120000_web_settings_azul_payment_link.sql`
- Modify: `apps/web/src/server/db/database.types.ts` (regenerado por MCP)

**Interfaces:**
- Produces: columna `business_web_settings.azul_payment_link_url text NULL` disponible en prod y en `database.types.ts`.

- [ ] **Step 1: Escribir la migración**

```sql
-- El enlace de pago de Azul del comercio (pagos.azul.com.do/...). NULL o vacío
-- = no se ofrece tarjeta en la tienda. La validación del formato vive en la
-- aplicación (features/storefront/azul-link.ts).
alter table public.business_web_settings
  add column if not exists azul_payment_link_url text;
```

- [ ] **Step 2: Aplicarla a prod vía MCP** (`mcp__supabase-dermaland__apply_migration`, nombre `web_settings_azul_payment_link`) tras cargar `production-change-control`. Es aditiva, nullable, sin backfill.

- [ ] **Step 3: Regenerar tipos** con `mcp__supabase-dermaland__generate_typescript_types` y sobreescribir `apps/web/src/server/db/database.types.ts`. Verificar con `git diff` que el cambio es solo la columna nueva (más ruido de generación si lo hubiera).

- [ ] **Step 4: `pnpm --filter web typecheck`** — 0 errores.

- [ ] **Step 5: Commit** — `feat(tienda): columna para el enlace de pago de Azul`

### Task 2: Validador puro del enlace (TDD)

**Files:**
- Create: `apps/web/src/features/storefront/azul-link.ts`
- Test: `apps/web/src/features/storefront/azul-link.test.ts`

**Interfaces:**
- Produces: `normalizeAzulPaymentLink(input: string): { ok: true; url: string | null } | { ok: false; error: string }` — `""`/espacios → `{ ok: true, url: null }` (borrar el enlace es legítimo); URL válida → normalizada con `https://`; cualquier otro host/esquema → `{ ok: false }`.

- [ ] **Step 1: Prueba que falla** (`azul-link.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { normalizeAzulPaymentLink } from "./azul-link";

describe("normalizeAzulPaymentLink", () => {
  it("acepta el enlace del comercio y lo devuelve normalizado", () => {
    expect(normalizeAzulPaymentLink("https://pagos.azul.com.do/dcb1c70b"))
      .toEqual({ ok: true, url: "https://pagos.azul.com.do/dcb1c70b" });
  });
  it("acepta sin esquema y lo sube a https", () => {
    expect(normalizeAzulPaymentLink("pagos.azul.com.do/dcb1c70b"))
      .toEqual({ ok: true, url: "https://pagos.azul.com.do/dcb1c70b" });
  });
  it("vacío = sin enlace, no un error", () => {
    expect(normalizeAzulPaymentLink("  ")).toEqual({ ok: true, url: null });
  });
  it("rechaza otros dominios: un tipeo no puede mandar a pagar a otro sitio", () => {
    for (const malo of [
      "https://pagos.azul.com.do.evil.com/x",
      "https://azul.com.do/pagar",
      "http://pagos.azul.com.do/x",
      "javascript:alert(1)",
    ]) {
      expect(normalizeAzulPaymentLink(malo).ok).toBe(false);
    }
  });
});
```

Nota: `http://` explícito se rechaza (no se "sube" a https): quien pegó `http://` pegó un enlace que Azul no sirve.

- [ ] **Step 2: Correr y ver FAIL** — `pnpm --filter web exec vitest run src/features/storefront/azul-link.test.ts`

- [ ] **Step 3: Implementación mínima** (`azul-link.ts`): trim; vacío → `{ok:true,url:null}`; si no contiene `://`, anteponer `https://`; `new URL(...)` en try/catch; exigir `protocol === "https:"` y `hostname === "pagos.azul.com.do"`; devolver `url.toString()` sin barra final añadida.

- [ ] **Step 4: Correr y ver PASS.**

- [ ] **Step 5: Commit** — `feat(tienda): validador del enlace de pago de Azul`

### Task 3: El enlace atraviesa configuración → tenant → admin

**Files:**
- Modify: `apps/web/src/features/storefront/types.ts` (junto a `linktreeUrl?: string;` en `StorefrontTenant` y en el tipo de settings del admin si es distinto)
- Modify: `apps/web/src/server/services/storefront/tenant.ts:34` (SELECT) y `:156` (mapping)
- Modify: `apps/web/src/server/services/storefront/admin.ts:68,112,266,280,312` (lectura + patch, usando el validador)
- Modify: `apps/web/src/app/api/storefront/settings/route.ts:39` (zod, patrón `linktreeUrl`)
- Modify: `apps/web/src/features/storefront/components/admin/storefront-settings-form.tsx` (campo nuevo bajo el de Linktree)

**Interfaces:**
- Consumes: `normalizeAzulPaymentLink` (Task 2).
- Produces: `StorefrontTenant.azulPaymentLinkUrl?: string` (ausente si no configurado); el guardado del admin rechaza enlaces no-Azul con mensaje "Ese enlace no es de pagos.azul.com.do".

- [ ] **Step 1:** Seguir el patrón `linktree_url` campo a campo en los cinco archivos. En `admin.ts`, el patch pasa por `normalizeAzulPaymentLink`; si `!ok` devolver el error como ya se devuelven los demás errores de guardado. En el form, validar al enviar (como hace `normalizePublicUrl` con `linktreeUrl`) y mostrar el error sin vaciar el campo. Etiqueta del campo: **"Enlace de pago Azul"**, ayuda: *"Pega aquí tu enlace de pagos.azul.com.do. Con esto la tienda ofrece pagar con tarjeta."*
- [ ] **Step 2:** `pnpm --filter web typecheck` — 0 errores.
- [ ] **Step 3:** Manual: en la pantalla de configuración de la tienda, guardar un enlace válido, uno inválido (rechazado con mensaje) y vaciarlo (guarda `null`).
- [ ] **Step 4: Commit** — `feat(tienda): el enlace de Azul se configura en la administracion`

### Task 4: El pedido acepta `'tarjeta'`

**Files:**
- Modify: `apps/web/src/server/services/storefront/orders.ts:55` → `paymentMethod?: "efectivo" | "transferencia" | "tarjeta";` y `:254-255` → escribir `'tarjeta'` cuando venga `'tarjeta'` (default `efectivo` intacto).
- Modify: `apps/web/src/app/api/storefront/orders/route.ts:34` → `z.enum(["efectivo", "transferencia", "tarjeta"]).default("efectivo")`.

**Interfaces:**
- Produces: `web_orders.payment_method = 'tarjeta'` persiste; la lectura ya lo mapea (`orders.ts:491,1052`).

- [ ] **Step 1:** Hacer ambos cambios. En `:254` el mapeo queda explícito por lista blanca, p. ej. `input.paymentMethod === "transferencia" || input.paymentMethod === "tarjeta" ? input.paymentMethod : "efectivo"`.
- [ ] **Step 2:** `pnpm --filter web typecheck` y `pnpm --filter web test` — verde.
- [ ] **Step 3: Commit** — `feat(pedidos-web): el pedido admite pago con tarjeta`

### Task 5: El checkout ofrece "Tarjeta (enlace seguro de Azul)"

**Files:**
- Modify: `apps/web/src/app/tienda/checkout/page.tsx` — pasar `azulPaymentLink={tenant.azulPaymentLinkUrl ?? null}` a `CheckoutView`.
- Modify: `apps/web/src/features/storefront/components/checkout-view.tsx` — prop nueva, estado y opciones.

**Interfaces:**
- Consumes: `StorefrontTenant.azulPaymentLinkUrl` (Task 3), `'tarjeta'` aceptado por la API (Task 4).
- Produces: pedido creado con `paymentMethod: "tarjeta"`.

- [ ] **Step 1:** En `checkout-view.tsx`:
  - Prop `azulPaymentLink?: string | null` (default `null`).
  - Estado `metodoPago` pasa a `"efectivo" | "transferencia" | "tarjeta"` (sigue arrancando en `"efectivo"`).
  - El fieldset "¿Cómo pagas?" se muestra si `bankAccounts.length > 0 || azulPaymentLink`. Las opciones se arman en un array: `efectivo` siempre; `transferencia` solo con cuentas; `tarjeta` solo con enlace, con textos `["tarjeta", "Tarjeta (enlace seguro de Azul)", "Pagas en la página de Azul y subes el comprobante"]`.
  - Si `metodoPago === "tarjeta"`, caja informativa (misma clase que la de transferencia): *"Al enviar el pedido te damos el enlace seguro de Azul con el total exacto a pagar. Subes el comprobante ahí mismo y confirmamos tu pago."*
  - Texto bajo el botón: si `metodoPago === "tarjeta"`, *"Después de enviar el pedido pagas con tarjeta por el enlace seguro de Azul."* (la rama `cardPaymentsEnabled` existente queda como está, primero en la cadena).
- [ ] **Step 2:** `pnpm --filter web typecheck` — 0 errores. Manual en `:3031`: con enlace configurado aparece la opción; sin él, no; el pedido se crea con tarjeta.
- [ ] **Step 3: Commit** — `feat(tienda): el checkout ofrece pagar con tarjeta por el enlace de Azul`

### Task 6: La página del pedido cobra: caja de pago Azul

**Files:**
- Create: `apps/web/src/features/storefront/components/azul-pay-box.tsx` (client component)
- Modify: `apps/web/src/app/tienda/pedido/[token]/page.tsx:53-64` (condición de claims/comprobantes) y sección nueva tras la de transferencia (`:175-221`).

**Interfaces:**
- Consumes: `pedido.paymentMethod === "tarjeta"`, `pedido.total`, `pedido.number`, `tenant.azulPaymentLinkUrl`, `ReceiptUpload` (existente), `listOrderReceipts`.
- Produces: `AzulPayBox({ url, amountLabel, orderNumber }: { url: string; amountLabel: string; orderNumber: string })`.

- [ ] **Step 1:** `azul-pay-box.tsx` (`"use client"`): muestra el monto en grande con botón "Copiar monto" (`navigator.clipboard.writeText` del número sin formato de moneda — Azul pide cifras —, con estado "Copiado" 2 s y fallback silencioso si no hay clipboard), el número de pedido con su propio "Copiar", instrucciones numeradas (1. Abre el enlace seguro de Azul. 2. Teclea el monto exacto. 3. Pon tu número de pedido como referencia/concepto. 4. Sube aquí el comprobante que te da Azul), y el botón "Pagar con Azul" como `<a href={url} target="_blank" rel="noopener noreferrer">` con el estilo del botón primario. Recibe `amountLabel` YA formateado y también el monto crudo si se necesita para copiar: usar prop adicional `amountRaw: string` (p. ej. `"1250.00"`).

  Firma final: `AzulPayBox({ url, amountLabel, amountRaw, orderNumber })`.
- [ ] **Step 2:** En la página del pedido:
  - `:56` → `pedido.paymentMethod === "transferencia" || pedido.paymentMethod === "tarjeta" ? verifyDocumentShareToken(token) : null`. Las `cuentas` solo hacen falta para transferencia: `claims && pedido.paymentMethod === "transferencia" ? listActiveBankAccounts(...) : []` (mantener el `Promise.all` legible).
  - Sección nueva `pedido.paymentMethod === "tarjeta" && !cancelado`, espejo de la de transferencia: título `pagado ? "Pago confirmado" : "Paga con tarjeta"`; si `pagado`, *"Confirmamos tu pago. Ya estamos preparando el pedido."*; si no, `<AzulPayBox url={tenant.azulPaymentLinkUrl!} amountLabel={formatCurrency(pedido.total)} amountRaw={pedido.total.toFixed(2)} orderNumber={pedido.number} />` + `<ReceiptUpload token={token} yaSubido={comprobantes.length > 0} />`. Si el admin borró el enlace después de crearse el pedido (`azulPaymentLinkUrl` ausente), en su lugar: *"Te contactamos para coordinar el pago."* — nunca un botón muerto.
- [ ] **Step 3:** `pnpm --filter web typecheck`. Manual: pedido con tarjeta muestra la caja, copia el monto, abre el enlace, sube comprobante; tras aceptar el comprobante en el admin, muestra "Pago confirmado".
- [ ] **Step 4: Commit** — `feat(tienda): la pagina del pedido cobra por el enlace de Azul`

### Task 7: El admin revisa comprobantes de tarjeta

**Files:**
- Modify: `apps/web/src/app/(app)/pedidos-web/[id]/page.tsx:66,212-213,389,394`

**Interfaces:**
- Consumes: flujo `web_order_receipts` + `ReceiptReview` existentes (agnósticos al método).

- [ ] **Step 1:** Extraer al inicio `const pagoConComprobante = pedido.paymentMethod === "transferencia" || pedido.paymentMethod === "tarjeta";` y usarla en `:66` y `:389`. Título de la sección (`:394`): `pedido.paymentMethod === "tarjeta" ? "Pago con tarjeta (Azul)" : "Pago por transferencia"`. El texto de `:212-213` pasa a decir "y el comprobante del pago" cuando `pagoConComprobante`.
- [ ] **Step 2:** `pnpm --filter web typecheck`. Manual: pedido de tarjeta en el admin muestra la sección, aceptar el comprobante marca `pagado`.
- [ ] **Step 3: Commit** — `feat(pedidos-web): revision de comprobantes tambien para tarjeta`

### Task 8: `missingCheckoutFields` (TDD)

**Files:**
- Create: `apps/web/src/features/storefront/checkout-missing-fields.ts`
- Test: `apps/web/src/features/storefront/checkout-missing-fields.test.ts`

**Interfaces:**
- Produces:

```ts
export type CheckoutFieldId =
  | "contactName" | "contactPhone" | "fulfillment"
  | "province" | "sector" | "address";

export interface CheckoutSnapshot {
  nombre: string;
  telefono: string;
  entrega: "pickup" | "delivery" | null;
  provincia: string;
  sector: string;
  direccion: string;
}

export interface MissingField {
  /** id del elemento del DOM al que desplazarse y marcar. */
  field: CheckoutFieldId;
  /** Para el resumen: "tu nombre", "tu teléfono"… */
  label: string;
  /** Bajo el campo: "Falta tu nombre." */
  message: string;
}

export function missingCheckoutFields(s: CheckoutSnapshot): MissingField[];
```

- [ ] **Step 1: Prueba que falla** — casos: todo vacío con `entrega: null` → `["contactName","contactPhone","fulfillment"]` en ese orden (los de envío NO aparecen sin entrega elegida: pedir la provincia antes de elegir envío sería ruido); `entrega: "pickup"` completo → `[]`; `entrega: "delivery"` sin provincia/sector/dirección → los tres, y con todo → `[]`; espacios en blanco cuentan como vacío (`"  "` en nombre → falta). `fulfillment` usa `message: "Elige si lo retiras en sucursal o te lo llevamos."` (el texto que hoy pone `setError`).
- [ ] **Step 2: FAIL** — `pnpm --filter web exec vitest run src/features/storefront/checkout-missing-fields.test.ts`
- [ ] **Step 3: Implementación** — lista ordenada de reglas `(s) => MissingField | null`, `trim()` para vacío; la sucursal de retiro no entra (arranca con la primera y siempre tiene valor); el correo, la referencia y la nota son opcionales y no entran.
- [ ] **Step 4: PASS.**
- [ ] **Step 5: Commit** — `feat(tienda): la regla de que falta en el checkout, pura y probada`

### Task 9: El checkout marca lo que falta

**Files:**
- Modify: `apps/web/src/features/storefront/components/checkout-view.tsx`

**Interfaces:**
- Consumes: `missingCheckoutFields` (Task 8). Ids del DOM ya existentes: `contactName`, `contactPhone`, `province`, `sector`, `address`; el bloque de entrega necesita `id="fulfillment"` en su `<fieldset>` (hoy no lo tiene).

- [ ] **Step 1:** Estado `const [faltantes, setFaltantes] = React.useState<MissingField[]>([]);`. En `enviar()`, ANTES del fetch: construir el snapshot, `const faltan = missingCheckoutFields(...)`; si hay, `setFaltantes(faltan)`, desplazarse al primero (`document.getElementById(faltan[0].field)?.scrollIntoView({ behavior: "smooth", block: "center" })` + `focus({ preventScroll: true })` si es focusable) y `return`. La comprobación existente de `entrega === null` queda cubierta por esto; la de `envio === null` con delivery se mantiene.
- [ ] **Step 2:** Botón: quitar `entrega === null` del `disabled` (queda `enviando || !resumen`). Los avisos amarillos de `:855-863` sobran cuando `faltantes` ya explica lo mismo: se quitan (el de provincia lo cubre `province` en faltantes).
- [ ] **Step 3:** Marcado por campo: helper `const falta = (id: CheckoutFieldId) => faltantes.find((f) => f.field === id);`. En cada input afectado: `aria-invalid={falta("contactName") ? true : undefined}`, clase de borde de error (`border-[color:var(--brand-danger,#dc2626)]` si existe token de peligro; si no, `border-red-500` — comprobar `globals.css` y usar el token que haya), y debajo `<p id="error-contactName" role="alert" className="mt-1 text-xs text-red-600">{falta("contactName")?.message}</p>` ligado con `aria-describedby`. Al cambiar un campo, limpiar su entrada: `setFaltantes((f) => f.filter((x) => x.field !== "contactName"))` en su `onChange` (y al elegir entrega, la de `fulfillment`).
- [ ] **Step 4:** Resumen sobre el botón cuando `faltantes.length > 0`: caja `role="alert"` con *"Te falta completar:"* + lista de `label` como enlaces `<a href="#contactName">` que hacen scroll.
- [ ] **Step 5:** `pnpm --filter web typecheck` y `pnpm --filter web test`. Manual en 390 y 1280: enviar vacío marca todo y se desplaza; completar un campo limpia su marca; con todo lleno el pedido sale.
- [ ] **Step 6: Commit** — `feat(tienda): el checkout dice claro que falta por completar`

### Task 10: Documentar, versionar y validar todo

**Files:**
- Modify: `docs/pagos-en-linea.md` (sección nueva: "Cobro por enlace de pago Azul (ACTIVO)" — qué es, confirmación manual, dónde se configura; la afiliación API sigue pendiente y el resto del doc intacto)
- Modify: `docs/tienda-en-linea.md` (método de pago nuevo, una mención)
- Modify: `CHANGELOG.md` + `package.json` (versión `0.131.0`)
- Modify: `PROJECT_MEMORY.md`, `docs/estado-actual.md`, `docs/decisiones.md` (decisión: enlace de pago manual, no adaptador API)

- [ ] **Step 1:** Escribir docs y bump `0.130.0 → 0.131.0` con entrada de CHANGELOG (dos mejoras).
- [ ] **Step 2:** Validación completa: `pnpm --filter web typecheck` && `pnpm --filter web test` && `pnpm --filter web build` — todo verde.
- [ ] **Step 3: Commit** — `docs(tienda): pago por enlace Azul y checkout claro (v0.131.0)`
- [ ] **Step 4:** Informar al usuario: pendiente SU decisión de push a `main` (= deploy a producción) y pegar el enlace real en la pantalla de configuración.

## Self-review

- **Cobertura del spec:** enlace en administración fail-closed (T1-T3), checkout con tarjeta (T4-T5), pago en la página del pedido con copiar/instrucciones/comprobante (T6), revisión admin (T7), campos faltantes marcados con resumen, scroll y aria (T8-T9), docs y pruebas (T10). Sin huecos.
- **Placeholders:** ninguno; cada paso tiene código o cambio concreto con rutas y líneas.
- **Consistencia de tipos:** `normalizeAzulPaymentLink` (T2) se usa en T3; `azulPaymentLinkUrl` (T3) en T5-T6; `'tarjeta'` (T4) en T5-T7; `missingCheckoutFields`/`MissingField`/`CheckoutFieldId` (T8) en T9; `AzulPayBox` definida y consumida en T6.
