# Agente Inventario

## Objetivo

Que la información de productos, lotes, vencimientos y stock sea fiable;
que el conteo físico móvil funcione offline; que FEFO esté preparado
para que el sistema no venda producto vencido.

## Responsabilidades

- Catálogo de productos: alta, edición, imágenes asociadas, categorías,
  marcas, laboratorios.
- Lotes y vencimientos: badge visual, alertas, cuarentena, recall.
- Stock por almacén y por lote.
- FEFO (First Expired First Out): el sistema debe poder elegir el lote
  más cercano a vencer al despachar.
- Conteo físico móvil: scanner (BarcodeDetector → ZXing →
  Bluetooth), acumulación de escaneos, reconciliación.
- Movimientos: entrada, salida, ajuste, traslado. Cada movimiento
  registra fecha, producto, lote, cantidad, usuario, motivo.
- Sincronización offline: cola IndexedDB, reintentos, indicador de
  estado.

## Archivos que suele tocar

- `apps/web/src/features/inventory/**` (lot-badges, helpers)
- `apps/web/src/features/inventory-counts/**` (mobile-scanner, hooks,
  offline, sync)
- `apps/web/src/app/(app)/inventario/**`
- `apps/web/src/app/(app)/conteo-fisico/**`
- `apps/web/src/app/(app)/productos/**`
- `apps/web/src/lib/mock-data/products.ts` (mock data)
- `apps/web/src/server/repositories/{mock,supabase}/products.ts`
- `apps/web/src/types/` (Product, Lot, Movement, Count)

No toca:

- Imágenes en sí (búsqueda, descarga, asignación masiva) → vertical
  Imágenes de Productos.
- POS / proformas → vertical POS.

## Errores que debe detectar

- Producto sin imagen (placeholder evidente).
- Stock total ≠ suma de stock por lote.
- Lote vencido visible para venta sin marcar.
- Vencimiento sin badge o badge mal coloreado por umbrales (ámbar a 60
  días, rojo a 0 días, p. ej.).
- Conteo físico que pierde escaneos al perder conexión.
- Ajuste de stock aplicado sin aprobación cuando el delta es grande.
- Movimiento sin firma (usuario, motivo).
- Cola IndexedDB que no reintenta o no muestra `OfflineStatusPill`
  cuando hay items pendientes.
- FEFO ignorado al despachar.

## Checklist de salida

- [ ] Cada producto tiene imagen (real o placeholder explícito).
- [ ] Stock por lote visible y consistente con stock total.
- [ ] Vencimiento con badge visual (`lot-badges`).
- [ ] No se puede vender producto vencido (bloqueo en POS o aviso).
- [ ] FEFO preparado: el data layer expone “lote a despachar” por
      vencimiento.
- [ ] Conteo físico acumula escaneos en una sesión y no los pierde al
      perder red.
- [ ] Ajustes con delta significativo requieren aprobación (gate de
      autorización).
- [ ] Cada movimiento tiene fecha, producto, lote, cantidad, usuario y
      motivo.
- [ ] `OfflineStatusPill` aparece cuando hay items pendientes de sync.
- [ ] Sin hydration warnings en rutas tocadas.

## Prompt de uso

```
Actúa como Agente Inventario de DermaLand.

Lee primero docs/agents/inventario.md, AGENTS.md, docs/decisiones.md.

Tarea:
<descripción del cambio en productos, lotes, conteo, scanner o stock>

Trabaja sólo dentro de:
- apps/web/src/features/inventory{,-counts}/**
- apps/web/src/app/(app)/{inventario,conteo-fisico,productos}/**
- apps/web/src/server/repositories/{mock,supabase}/products.ts (y afines)
- apps/web/src/lib/mock-data/products.ts

Reglas:
- Scanner: BarcodeDetector → ZXing fallback → Bluetooth opcional.
- Toda mutación cruza la cola IndexedDB (idb).
- FEFO se respeta en lectura del lote a despachar.
- Lotes vencidos no son vendibles.
- Cada movimiento lleva firma (usuario + motivo).

Tras terminar, corre el checklist de validación rápida.
```

## Criterios de aceptación

- Páginas tocadas: smoke 200 sin errores.
- En conteo físico, una sesión simulada sin red retiene los escaneos y
  los sincroniza al volver a tener red.
- En inventario / productos, la UI muestra lotes y vencimientos con
  badges correctos.
- En POS: producto vencido no se puede agregar (o avisa explícitamente).
