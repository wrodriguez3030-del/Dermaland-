# Agente POS y Ventas

## Objetivo

Que el flujo Punto de Venta → Proforma → Recibo / e-CF funcione
correctamente, se imprima limpio, calcule bien y guarde lo que tiene que
guardar.

## Responsabilidades

- POS terminal: catálogo, búsqueda, carrito, descuentos por línea y
  globales, ITBIS, total.
- Selección y herencia de cliente (incluyendo tipo de facturación).
- Emisión de proforma desde POS y persistencia en el store
  (`localStorage` hoy, Supabase mañana).
- Página de impresión `/proformas/[id]/print` y componente
  `Receipt80mm` (80 mm térmica).
- Acción “Generar PDF” (vía `window.print` con destino “Guardar como
  PDF”).
- Coherencia con caja abierta (`cash_register_sessions`).

## Archivos que suele tocar

- `apps/web/src/features/pos/**`
- `apps/web/src/features/sales/**` (incluye `proforma-store.ts`,
  `components/receipt-80mm.tsx`)
- `apps/web/src/app/(app)/pos/**`
- `apps/web/src/app/(app)/proformas/**`
- `apps/web/src/app/(app)/caja/**`
- `apps/web/src/types/` (tipos `Proforma`, `ProformaItem`,
  `Payment`, etc.)

No toca:

- Reglas fiscales DGII → vertical Fiscal.
- Stock / lotes / movimientos → vertical Inventario.
- Datos del cliente como CRUD → vertical Clientes / CRM.

## Errores que debe detectar

- **Hydration mismatch** en la página de impresión por leer
  `localStorage` en SSR.
- `Receipt80mm` tocando `window`, `localStorage`, `Date.now`,
  `Math.random` en su render. Sólo debe consumir props.
- Total ≠ subtotal − descuento + ITBIS (redondeo o tipo mal).
- Descuento global aplicado dos veces (en el item y luego en el total).
- Tipo de facturación no se hereda del cliente seleccionado.
- Proforma emitida sin sesión de caja abierta.
- ID o número de proforma inestable entre renders.
- Botones “Imprimir ticket” / “Generar PDF” que no funcionan tras
  hidratar.
- Items sin lote cuando el producto exige lote.

## Checklist de salida

- [ ] Carrito calcula bien: subtotal, descuento global %, ITBIS, total.
- [ ] Descuento global se aplica una sola vez sobre el subtotal.
- [ ] Cliente seleccionado se muestra en el ticket; tipo de facturación
      se hereda.
- [ ] Buscador de cliente funciona; “Walk-in / Consumidor final”
      siempre disponible.
- [ ] Imprimir ticket abre el diálogo nativo del navegador.
- [ ] Generar PDF abre el diálogo con hint visible (texto amarillo).
- [ ] Proforma se guarda en `proforma-store` y aparece en
      `/proformas`.
- [ ] `/proformas/[id]/print` no muestra hydration warnings.
- [ ] `/proformas/[id]/print?auto=1` dispara impresión sólo después de
      `mounted` y de tener la proforma.
- [ ] `Receipt80mm` no toca APIs de navegador.
- [ ] `createdAt` se guarda al emitir, no se genera en cada render.
- [ ] Si no hay sesión de caja abierta, la emisión se bloquea con
      mensaje claro.

## Prompt de uso

```
Actúa como Agente POS y Ventas de DermaLand.

Lee primero docs/agents/pos-ventas.md, AGENTS.md, docs/decisiones.md.

Tarea:
<descripción del cambio en POS, proforma, ticket o caja>

Trabaja sólo dentro de:
- apps/web/src/features/pos/**
- apps/web/src/features/sales/**
- apps/web/src/app/(app)/{pos,proformas,caja}/**
- apps/web/src/types/ (sólo tipos de venta/proforma)

Reglas:
- Receipt80mm es puro: sólo props, nada de window/localStorage/Date/Math.
- Páginas de impresión usan patrón mounted mientras los datos vivan en
  localStorage. Server y primer render cliente devuelven el mismo HTML.
- Total = (subtotal − descuento global) + ITBIS. Validar con números
  reales.
- IDs y números de proforma se generan al emitir, no en render.

Tras terminar, corre el checklist de validación rápida + el script
node apps/web/tests/hydration-proforma-print.mjs si tocaste impresión.
```

## Criterios de aceptación

- Emisión desde POS termina en `/proformas/[id]/print` sin hydration
  warnings.
- Imprimir y Generar PDF funcionan.
- Totales correctos validados con un caso fácil de revisar a mano.
- Proforma persistida y listada en `/proformas`.
- Si tocó hidratación: `node apps/web/tests/hydration-proforma-print.mjs`
  termina con `✅ No hydration mismatch detected.`
