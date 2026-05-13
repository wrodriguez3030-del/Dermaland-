# CLAUDE.md — Contexto principal de DermaLand

> **Antes de modificar código en DermaLand, lee este archivo completo, luego
> revisa `PROJECT_MEMORY.md`, `docs/decisiones.md`, `docs/riesgos.md` y
> `docs/estado-actual.md`. Usa esos archivos como memoria persistente del
> proyecto. No trabajes fuera de `C:\dev\dermaland`. No uses Google Drive
> como carpeta de trabajo.**

## Identidad del proyecto

| Campo | Valor |
|---|---|
| Nombre | **DermaLand** |
| Tipo | SaaS multi-empresa para farmacia, dermocosmética y cuidado dermatológico |
| País | República Dominicana 🇩🇴 |
| Moneda | DOP (peso dominicano) |
| Idioma | Español (es-DO) |
| Ruta local | `C:\dev\dermaland` |
| App web | `C:\dev\dermaland\apps\web` |
| Puerto local | `3031` |
| Repo GitHub | `https://github.com/wrodriguez3030-del/Dermaland-` (rama de prod: `main`) |
| Proyecto Vercel | `dermaland` (scope `wrodriguez3030-4801s-projects`) |
| Producción | `https://dermaland.vercel.app` |
| Stack | Next.js **15.5.18** (App Router) · React 19 · TypeScript estricto · Tailwind 4 · pnpm · (Supabase Postgres + Auth + Storage + RLS para producción) |

## Reglas duras (no negociables)

1. **Trabajar sólo dentro de `C:\dev\dermaland`.**
2. **No usar Google Drive** (`H:\Mi unidad\PROYECTO DERMALAND\`) como
   carpeta de trabajo. Drive es sólo lectura para specs/datos del
   cliente.
3. **Sin agenda, sin citas, sin bookings.** DermaLand es farmacia /
   dermocosmética, no clínica. Cualquier intento de añadir agendamiento
   se rechaza en el agente Arquitecto.
4. **Multi-empresa.** Toda tabla con datos de tenant lleva
   `business_id`. Toda query Supabase filtra por `business_id`. RLS por
   `business_id` cuando entre Supabase real.
5. **Mock + Supabase tras la misma interfaz.** Toda lectura/escritura
   cruza `apps/web/src/server/repositories/`. Switch por
   `DATA_SOURCE=mock|supabase`.
6. **Hidratación segura.** Cualquier código de cliente que lea
   `localStorage`, `window`, `Date.now`, `Math.random` o formatos
   locales usa el patrón `mounted`. Server y primer render cliente
   devuelven el mismo HTML estable.
7. **No tocar credenciales reales** (env, certificados `.p12`, claves
   privadas) sin pedir confirmación.

## Modelo de negocio del MVP

### Inventario

- Producto + **lote** + **vencimiento** + **sede** + **almacén**.
- FEFO (First Expired First Out) en despacho.
- Lotes vencidos bloqueados para venta.
- Cuarentena y recall son flujos separados del conteo.
- Conteo físico móvil por **escaneo acumulativo** (BarcodeDetector →
  ZXing fallback → Bluetooth opcional). Toda escritura cruza la cola
  IndexedDB.

### POS / Ventas

- Catálogo con **fotos de producto**.
- **Descuento global en porcentaje** (sobre subtotal pre-ITBIS; ITBIS se
  re-escala proporcionalmente).
- **Cliente buscable** desde el POS (nombre, documento, teléfono).
- **Tipo de facturación por cliente** (`defaultBillingType`):
  `consumo` o `credito_fiscal`.
- Selector de método de pago **explícito**: ningún botón resaltado por
  default; el cajero hace clic en `Efectivo` / `Tarjeta` /
  `Transferencia`.
- **Reglas documentales** (función pura
  `resolveDocumentToIssue` en `src/features/sales/document-resolver.ts`):

  | billingType | paymentMethod | resultado |
  |---|---|---|
  | consumo | cash · transfer · paypal · manual · other | **Proforma** |
  | consumo | card · azul · cardnet · visanet | **Factura e-CF 32** (Consumo) |
  | credito_fiscal | cualquiera | **Factura e-CF 31** (Crédito Fiscal) |

  Crédito fiscal exige RNC del cliente (UI bloquea sin él).

### Tickets / impresión

- **Ticket 80mm** (`Receipt80mm`) para impresora térmica.
- Vista imprimible `/proformas/[id]/print` (server SSR + cliente con
  `mounted` mientras los datos vivan en `localStorage`).
- "Generar PDF" usa el diálogo nativo del navegador con destino
  "Guardar como PDF".

### Clientes / CRM

- Sin duplicados por `documentNumber`.
- Cédula / RNC / teléfono formateados.
- `defaultBillingType` por cliente.
- `skinType` como desplegable estructurado.

### UI

- Botones **Ver / Editar / Eliminar** visibles en filas (componente
  `RowActions`).
- Formularios centrados y responsivos (probar 390 / 768 / 1280).
- Tailwind 4. Sin librerías UI externas nuevas.
- Estados claros: vacío, cargando, error, éxito.

## Flujo de trabajo (sistema de agentes)

Antes de cada cambio, recorrer mentalmente el flujo definido en
[`AGENTS.md`](AGENTS.md) y [`docs/agents/workflow.md`](docs/agents/workflow.md):

```
1. Arquitecto       → revisa impacto, asigna agente del módulo
2. Agente del módulo→ ejecuta el cambio
3. QA / Testing     → typecheck + build + test + smoke + hydration
4. Corrector        → fix mínimo si QA encuentra fallos
5. Documentación    → actualiza CLAUDE.md, PROJECT_MEMORY.md,
                      decisiones.md, riesgos.md, estado-actual.md
6. QA               → vuelve a validar
7. Resumen          → qué cambió · cómo probar · pendientes
```

Lista de agentes con docs por agente: `docs/agents/`.

## Comandos canónicos

```powershell
cd C:\dev\dermaland
pnpm install                              # primera vez
pnpm --filter web dev                     # http://localhost:3031
pnpm --filter web typecheck               # tsc --noEmit
pnpm --filter web build                   # producción (rompe caché de dev: borrar .next y reiniciar dev)
pnpm --filter web test                    # vitest unit
node apps/web/tests/pos-flow-smoke.mjs    # smoke browser POS
node apps/web/tests/hydration-proforma-print.mjs  # hydration print
```

Más detalle: [`docs/comandos-locales.md`](docs/comandos-locales.md).

## Memoria persistente

Estos archivos son la memoria del proyecto entre sesiones de Claude.
Léelos al empezar y actualízalos al terminar:

| Archivo | Cuándo |
|---|---|
| `CLAUDE.md` (este archivo) | Si cambia una regla dura |
| `PROJECT_MEMORY.md` | Al cerrar cualquier cambio importante (estado, qué funciona, qué falta) |
| `docs/decisiones.md` | Cuando tomes una decisión técnica o de negocio |
| `docs/riesgos.md` | Cuando aparezca un riesgo abierto |
| `docs/estado-actual.md` | Lo que se completó / se entregó |
| `docs/proximos-pasos.md` | Lista priorizada de pendientes |
| `docs/contexto-general.md` | Si cambia el alcance del MVP o producción |
| `docs/comandos-locales.md` | Si cambia un comando o ruta |

## Cuándo SÍ preguntar

Aún con autonomía concedida, **siempre** preguntar antes de:

1. Borrar archivos de código fuente.
2. Eliminar datos reales (no mock).
3. Tocar credenciales / certificados / API keys / contraseñas.
4. Trabajar fuera de `C:\dev\dermaland`.
5. Modificar Google Drive.
6. Desplegar a producción.
7. Cualquier acción destructiva irreversible.
8. Cambiar una decisión de negocio ya aprobada.
9. Conectar una API real con credenciales reales.
10. Cambiar el stack principal.

Para todo lo demás: decide, ejecuta, valida, corrige, documenta, continúa.

---

**Última revisión:** 2026-05-07
