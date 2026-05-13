# Contexto general — DermaLand

## ¿Qué es DermaLand?

**DermaLand** es un SaaS multi-empresa diseñado para operar farmacias,
puntos de venta de dermocosmética y tiendas de cuidado dermatológico
profesional en **República Dominicana**. Centraliza catálogo, inventario
por lote, punto de venta, facturación electrónica DGII, CRM,
recomendaciones dermatológicas y canales de comunicación (WhatsApp +
agente IA) en una sola plataforma.

Es **mono-país en su MVP** (RD · DOP · es-DO · DGII), pero está
diseñado para escalar a otros países con normativas fiscales locales en
fases posteriores.

## ¿Para quién es?

- **Pyme dermocosmética / farmacia** que vende productos con
  vencimiento, lotes y trazabilidad sanitaria.
- **Negocios con varias sucursales** que necesitan inventario por sede
  y por almacén.
- **Equipos no técnicos:** cajeros, almaceneros, dueñas. La UI tiene
  que ser explícita y rápida en mostrador.
- **Cliente final del MVP:** DermaLand RD (Santiago + tiendas piloto).

## Módulos del sistema

### Implementados (MVP navegable con mock data)

- **POS / Ventas** · Carrito, descuentos, cliente buscable, tipo de
  facturación, método de pago explícito, emisión de proforma o factura
  e-CF según las reglas (`resolveDocumentToIssue`).
- **Caja** · Sesiones de cajero (apertura, cierre, conteo).
- **Proformas** · Listado y vista imprimible 80mm + PDF.
- **Clientes / CRM** · Alta/edición/perfil, búsqueda, sin duplicados,
  tipo de piel y de facturación, consentimientos.
- **Productos** · Catálogo con foto, marca, laboratorio, categoría,
  forma farmacéutica, registro sanitario, ITBIS por producto.
- **Inventario** · Stock por producto/lote/almacén, movimientos,
  vencimientos, badges de FEFO, cuarentena, recall.
- **Conteo físico móvil** · Scanner (BarcodeDetector → ZXing →
  Bluetooth), cola IndexedDB offline, reconciliación.
- **DGII (stubs)** · Configuración, certificado, secuencias,
  facturas, envíos.
- **WhatsApp (stubs)** · Plantillas, conversaciones, webhook.
- **IA (stubs)** · Agentes, conversaciones, registry de tools.
- **Reportes** · Ventas, productos, inventario, conteos, caja, clientes.
- **Recomendaciones dermatológicas** · Tipos de piel, condiciones,
  rutinas, recomendaciones por cliente.
- **Notas de crédito · Devoluciones · Pagos**.
- **Admin** · Empresa, sucursales, usuarios, roles, permisos,
  auditoría, configuración.
- **Super-Admin** · Negocios, planes, suscripciones, branding, módulos,
  uso, pagos.
- **API V3** · Llaves, scopes, rate limit (esqueleto).

### Módulos que NO debe tener

DermaLand **NO** es:

- ❌ App de **agendamiento** / citas / bookings / calendario clínico.
- ❌ Plataforma de **historia clínica electrónica** estilo HIS.
- ❌ Marketplace abierto al consumidor final.
- ❌ App de delivery / logística.
- ❌ Plataforma de e-learning / cursos para clientes.

Estas líneas son frontera dura. El agente Arquitecto bloquea cualquier
intento de añadirlas (ver `docs/agents/arquitecto.md`).

## Reglas principales de negocio

### Inventario

1. **Producto + lote + vencimiento + sede + almacén.** Stock siempre
   está desagregado por lote.
2. **FEFO automático** al despachar (lote más cercano a vencer
   primero).
3. **Lotes vencidos bloqueados para venta.** El POS no permite agregar
   un producto cuyo único stock disponible esté vencido.
4. **Cuarentena y recall** son flujos separados del conteo físico.

### POS / Facturación

1. **Cliente buscable** desde el POS (nombre, documento, teléfono).
2. **Tipo de facturación por cliente** (`defaultBillingType`):
   `consumo` o `credito_fiscal`. El POS lo respeta.
3. **Método de pago explícito.** Ningún botón `Efectivo` / `Tarjeta` /
   `Transferencia` está activo hasta que el cajero hace clic.
4. **Reglas documentales:**
   - `consumo` + (efectivo · transferencia · paypal · manual · other)
     → **Proforma**.
   - `consumo` + (tarjeta · azul · cardnet · visanet) → **Factura e-CF
     32 (Consumo)**.
   - `credito_fiscal` + cualquiera → **Factura e-CF 31 (Crédito
     Fiscal)**. Exige RNC del cliente.
5. **Descuento global** en porcentaje sobre subtotal pre-ITBIS. ITBIS
   se re-escala proporcionalmente sobre la base imponible descontada.
6. **Toda venta nace como proforma** en el store local (MVP); el campo
   `documentKind` indica si la intención era proforma o factura para
   cuando DGII real se conecte.

### CRM

1. **Sin duplicados** por `documentNumber`.
2. **Cédula RD / RNC / teléfono** formateados.
3. **Tipo de piel** estructurado (desplegable, no texto libre).

### UI

1. Botones **Ver / Editar / Eliminar** visibles en filas.
2. Formularios centrados y responsivos (390 / 768 / 1280).
3. **Hidratación segura** (patrón `mounted` cuando se lee
   `localStorage` / `window` / `Date.now`).
4. Tailwind 4. Sin librerías UI externas nuevas.
5. Estados claros: vacío, cargando, error, éxito.

### Multi-tenant

1. Toda tabla con datos de tenant lleva **`business_id`**.
2. Toda query Supabase filtra por `business_id`.
3. RLS por `business_id` cuando entre Supabase real (Fase P12).
4. Super-Admin tiene shell separada `(super-admin)/`.

## Alcance MVP (lo que tiene que funcionar HOY)

- ✅ MVP navegable con `DATA_SOURCE=mock`.
- ✅ POS con reglas documentales y selector de pago explícito.
- ✅ Impresión 80mm sin hydration errors.
- ✅ Catálogo + inventario + lotes + FEFO.
- ✅ Conteo físico móvil offline-first.
- ✅ CRM con default billing type por cliente.
- ✅ Stubs de DGII / WhatsApp / IA visibles en UI.
- ✅ Tests vitest + build limpio + smoke browser.
- ✅ Sistema de agentes documentado.

## Alcance producción (lo que falta para go-live)

- ⏳ Conectar Supabase real (`DATA_SOURCE=supabase`).
- ⏳ RLS activa por `business_id`.
- ⏳ Migrar mocks → repositorios Supabase reales.
- ⏳ DGII real: certificado, secuencias e-CF, envío + recepción de
  estados, conversión de proforma a e-CF.
- ⏳ WhatsApp Cloud API real: webhook firmado, plantillas aprobadas.
- ⏳ Agente IA real (OpenAI / Claude) con tools registradas.
- ⏳ CI/CD verde end-to-end (lint + typecheck + test + build + e2e).
- ⏳ Hosting / dominio / certificado SSL.
- ⏳ Plan de respaldos y observabilidad.
- ⏳ `docs/production-checklist.md` cerrado.

## Stack técnico

| Capa | Tecnología |
|---|---|
| Framework | Next.js 15 (App Router) + React 19 |
| Lenguaje | TypeScript estricto (`noUncheckedIndexedAccess`) |
| Estilos | Tailwind CSS 4 |
| UI primitives | manuales en `apps/web/src/components/ui/` |
| Forms / validación | Zod en bordes (server actions, API routes) |
| Backend | Supabase (Postgres + Auth + Storage + RLS) — Fase P12 |
| Mock backend (actual) | `apps/web/src/lib/mock-data/*.ts` + `apps/web/src/server/repositories/mock/` |
| Testing | Vitest + Playwright + Testing Library |
| Offline scanner | BarcodeDetector API + @zxing/browser fallback + IndexedDB queue |
| CI/CD | GitHub Actions |

## Decisiones rápidas

- **Repositorio único** para código (`C:\dev\dermaland`). Specs/datos
  del cliente viven en Drive (`H:\Mi unidad\PROYECTO DERMALAND\`),
  pero el código no.
- **pnpm workspace** con un solo paquete app (`apps/web`).
- **No agendamiento.** Se rechaza en revisión arquitectónica.
- **Multi-empresa por `business_id`** desde el día 1 — aunque hoy hay
  un solo tenant en mock.

---

**Última revisión:** 2026-05-07
