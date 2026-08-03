# Conteo físico: cerrar la persistencia en la nube

**Fecha:** 2026-08-03 · **Estado:** aprobado · **Versión objetivo:** 0.110.0

## Problema

El módulo de inventario físico se usa en producción —hay un Excel exportado el
2026-08-03— pero **el conteo vive solo en el `localStorage` del navegador donde se
hizo**. Si se limpia el almacenamiento o se cambia de equipo, se pierde.

Evidencia recogida el 2026-08-03 sobre la base real:

| Pieza | Estado |
|---|---|
| Listado y transiciones (`counts-store.ts`) | Ya usan `/api/inventory-counts`, con fallback a mock en 409 |
| Sesión de escaneo (`scan-session-store.ts`) | Solo `localStorage` |
| Cabecera al aprobar (`persist.ts`) | Persiste: 3 filas en `inventory_counts` |
| Ítems | **0 filas**, con las cabeceras declarando `item_count = 1` |
| Escaneos | **0 filas** en `inventory_count_scans` |
| Cola offline (`offline/db.ts`) | Escrita, sin ningún importador |
| Cliente de sync (`sync/sync.ts`) | Solo lo usa `offline-status-pill` para el indicador |

**Causa raíz:** `inventoryCount.create` hace dos `INSERT` independientes —cabecera y
luego ítems— sin transacción (`supabase/inventory-counts.ts:110` y `:148`). Si el
segundo falla, el primero queda escrito. Los 3 conteos del 13-jul son exactamente
eso: cabeceras huérfanas con un contador que miente.

El envío de escaneos nunca se cableó, así que la única oportunidad de subir datos
es al aprobar. Antes de aprobar, no hay nada en la nube.

## Qué se construye

### 1. Creación atómica sin DDL

Si el `INSERT` de ítems falla, se borra la cabecera recién creada y la operación
devuelve error. No hay migración ni cambio de esquema: la compensación vive en el
repositorio.

Se elige compensación en vez de una función Postgres transaccional porque el
objetivo es no romper nada: una RPC nueva exigiría DDL en producción, y el
beneficio sobre la compensación es marginal para este volumen (un conteo, decenas
de ítems, un solo escritor).

**Criterio de aceptación:** tras un fallo simulado en el insert de ítems, no queda
ninguna fila en `inventory_counts` para ese conteo.

### 2. El conteo nace en la nube

Al iniciar la sesión de escaneo se crea la cabecera en Supabase con estado
`in_progress`. Los escaneos se empujan en lotes contra
`POST /api/inventory-counts/sync`, que ya existe y **ya es idempotente**: el índice
único `(device_id, offline_scan_id)` hace que un reintento devuelva 200 en vez de
duplicar. Al aprobar solo se consolidan los ítems y se cambia el estado.

**Criterio de aceptación:** con la sesión a medias, `inventory_count_scans` contiene
los escaneos hechos hasta ese momento; reenviar el mismo lote no crea filas nuevas.

### 3. Recuperación al reabrir

Al abrir un conteo sin sesión local, se hidrata desde el servidor en lugar de
mostrarlo vacío. Es lo que permite continuar en otro equipo.

**Criterio de aceptación:** borrado el `localStorage`, abrir el conteo muestra los
ítems y escaneos que están en la nube.

### 4. Limpieza de los 3 huérfanos

Los conteos `224ce535`, `c76a2627` y `57aa1089` (13-jul) declaran `item_count = 1`
sin ítems. Son de prueba: se eliminan con respaldo previo.

## Qué no cambia

La UI, el flujo de escaneo con cámara y lector Bluetooth, la exportación a Excel,
el ajuste FEFO al aprobar y el fallback a mock cuando la API responde 409.

**Si la nube falla, el módulo se comporta como hoy:** la sesión local manda y
aparece el aviso de sincronización pendiente. La persistencia es aditiva, nunca
un requisito para seguir contando.

## Fuera de alcance

- **Cola IndexedDB offline** (`offline/db.ts`): contar sin señal es otro problema.
- **Ajuste FEFO en el servidor**: hoy son N llamadas desde el navegador. Moverlo a
  una operación atómica auditable es una mejora real, pero no sirve al objetivo de
  no perder datos y añade riesgo sobre el stock.

Ambas quedan anotadas para un ciclo posterior.

## Verificación

Se extienden las pruebas existentes: `persist.test.ts`, `scan-session-store.test.ts`,
`inventory-count-writes.test.ts` y `conteo-fisico-routes.test.ts`.

Casos nuevos:
1. Fallo en el insert de ítems → la cabecera no sobrevive.
2. Reenvío del mismo escaneo → 200 y sin fila duplicada.
3. Sin sesión local y con conteo en servidor → la pantalla se hidrata.
4. API caída → el flujo local sigue igual y avisa de sincronización pendiente.

Antes y después: `pnpm --filter web typecheck` y `pnpm --filter web test`.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Romper el flujo actual de escaneo | La persistencia es aditiva; todo fallo de red cae al comportamiento de hoy |
| Escrituras excesivas al escanear | Los escaneos van en lotes, no uno por petición |
| Duplicados al reintentar | Ya resuelto por el índice único de la ruta de sync |
| Perder datos al limpiar los huérfanos | Respaldo a `data/` antes de borrar |
