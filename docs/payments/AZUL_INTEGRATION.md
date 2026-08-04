# Integración con la Página de Pago de AZUL

> **Estado: EN CONSTRUCCIÓN, apagada.** `AZUL_ENABLED=false` en todos los
> entornos hasta completar la certificación con el banco. Nada de lo aquí
> descrito cobra dinero todavía.

---

## Fase 1 — Auditoría del proyecto (lo que se encontró)

| Aspecto | Qué hay |
|---|---|
| **Framework** | Next.js 15.5.18, App Router, React 19, TypeScript estricto |
| **Backend** | Route Handlers y Server Components en el mismo repo (`apps/web`). No hay servicio aparte. |
| **Frontend** | React 19 + Tailwind 4. Sin librería de estado global. |
| **Autenticación** | Supabase Auth. Claims de autorización **solo** en `app_metadata` (SEC-001). El middleware exige `business_id` para el ERP; la tienda es pública. |
| **Base de datos** | Supabase Postgres. **Sin ORM**: acceso por `@supabase/supabase-js` (PostgREST) desde `server/repositories/` y `server/services/`. Migraciones SQL a mano en `supabase/migrations/`. |
| **Multiempresa** | Sí. `business_id` en toda tabla de negocio + RLS por `business_id`. **La RLS valida el tenant, NO el rol** (DL-01): el rol se comprueba con `authorizeRole()` en cada ruta de mutación. |
| **Modelo de venta** | `proformas` + `proforma_items` + `proforma_payments` (POS y facturación, con e-CF de DGII). `web_orders` + `web_order_items` (pedidos de la tienda). **Son documentos distintos a propósito.** |
| **Pagos existentes** | Solo registro **manual** del método en el POS (`efectivo`, `tarjeta`, `azul`, `cardnet`…). **No hay ninguna pasarela conectada.** |
| **Módulo de pago en línea** | `features/storefront/payments/` con el contrato `PaymentProvider`, el registro fail-closed y un proveedor simulado. **Es el hueco donde encaja AZUL.** |
| **Variables de entorno** | `lib/env.ts` con esquema zod. Convención: sin `NEXT_PUBLIC_` para secretos. |
| **Logs y auditoría** | `audit_logs` con helper `getRepositories().audit.log(ctx, …)`, con etiquetas legibles. |
| **Rate limiting** | Ya existe: `server/security/rate-limit.ts`, usado en `/api/proformas/[id]/pdf`. **Se reutiliza.** |
| **Comparación en tiempo constante** | Ya existe el patrón en `server/services/sales/share-token.ts` (HMAC + `timingSafeEqual`). **Se reutiliza.** |

### Dónde encaja AZUL

En `features/storefront/payments/`, cumpliendo el contrato `PaymentProvider` que
ya existe. El registro (`payments/registry.ts`) tiene ya el `return null`
comentado esperando exactamente esto. **No se toca el POS, ni `proformas`, ni el
killswitch de DGII, ni las secuencias fiscales.**

Lo que se cobra son **`web_orders`**, no proformas: la proforma nace en el POS
con su caja y su cajero, y meter un cobro en línea ahí mezclaría dos flujos.

---

## Plan de implementación

| # | Entrega | Contenido |
|---|---|---|
| **1** | **Dinero sin decimales** | `payments/money.ts`: convertir DOP a unidades menores con enteros, **nunca flotantes**. Pruebas con los ejemplos de AZUL. |
| **2** | **AuthHash** | `payments/azul/auth-hash.ts`: HMAC-SHA512, orden de concatenación exacto, para petición y para respuesta. Pruebas con vectores fijos que congelan orden, codificación y formato. |
| **3** | **Modelo de datos** | Migración `payments` con `provider`, `order_number`, `amount_minor`, estados, `rrn`, `authorization_code`, e **índices únicos** para idempotencia. RLS deny-by-default. |
| **4** | **Crear el pago** | Ruta que valida la orden, **lee el monto de la base ignorando el del navegador**, crea el registro `PENDING` y devuelve los campos del formulario. |
| **5** | **Callbacks** | `approved` / `declined` / `cancelled`: validan AuthHash en tiempo constante, monto, tenant y estado; idempotentes. |
| **6** | **Interfaz** | Botón, resumen, pantallas de aprobado/declinado/cancelado, reintento seguro. Mensajes para personas, no códigos del banco. |
| **7** | **Conciliación** | Búsqueda por OrderNumber, RRN y código de autorización. Sin botón de "marcar como pagado" a mano. |
| **8** | **Documentación** | Los cuatro documentos de `docs/payments/`. |

### Reglas que gobiernan toda la entrega

1. **`AZUL_ENABLED=false` manda sobre todo.** Apagado, la ruta de pago no existe
   para nadie: 404, no un botón que falla.
2. **El monto sale de la base.** Aunque el navegador mande uno, se ignora.
3. **Llegar a `ApprovedUrl` no significa que se pagó.** Solo el AuthHash válido
   + `ISOCode = "00"` + monto coincidente + estado interno permitido.
4. **`AZUL_AUTH_KEY` nunca sale del servidor**: ni en JSON, ni en logs, ni en un
   mensaje de error. Hay una prueba que lo intenta.
5. **Ni número de tarjeta, ni CVV, ni fecha de expiración** tocan este sistema.
   El cliente los teclea en el sitio de AZUL. Es lo que mantiene a DermaLand
   fuera del alcance de PCI-DSS.
6. **Idempotencia por índice único**, no por comprobación en código: un callback
   repetido no puede cobrar dos veces aunque llegue diez veces.
