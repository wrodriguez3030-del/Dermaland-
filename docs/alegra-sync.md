# Sincronizador Alegra → DermaLand

Alegra es el sistema de verdad. DermaLand **solo lee** de Alegra: nunca escribe
nada allá. Cada corrida trae clientes, proveedores, productos (precio, costo,
código de barras, activo), el stock de las dos sucursales y las facturas de
venta con sus pagos y saldos.

Diseño y decisiones: [`docs/superpowers/specs/2026-09-05-alegra-sync-design.md`](superpowers/specs/2026-09-05-alegra-sync-design.md).

## Cómo se corre

El `--tsconfig` es **obligatorio**: sin él, `tsx` no resuelve los imports `@/`
de los módulos de la app y el script muere con `MODULE_NOT_FOUND`.

```bash
T="apps/web/node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json"

node scripts/test/alegra-live-test.mjs      # comprobar credenciales (solo lee)
$T scripts/alegra-sync.mts                  # SIMULACIÓN incremental (no escribe)
$T scripts/alegra-sync.mts --apply          # escribe
$T scripts/alegra-sync.mts --apply --full   # carga inicial: todo el histórico
$T scripts/alegra-sync.mts --entities=items,stock
$T scripts/alegra-sync.mts --since=2026-09-01
```

**Dry-run por defecto.** Sin `--apply` no se escribe nada, pero sí queda la fila
de la corrida en `alegra_sync_runs` (con `dry_run = true`) y el reporte en
`backups/alegra-sync-<fecha>/`.

Antes de cualquier `--apply`, respaldo:

```bash
node scripts/backup/rest-json-backup.mjs
```

## Qué hace con cada cosa

| De Alegra | A DermaLand |
|---|---|
| Contacto tipo `client` | `clients` (emparejado antes de crear, ver abajo) |
| Contacto tipo `provider` | `suppliers` |
| Ítem | `products`: costo, precio, ITBIS, activo, código de barras, `alegra_id` |
| `inventory.warehouses` id `1` | Stock de **DermaLand Principal** |
| `inventory.warehouses` id `2` | Stock de **Dermaland Villa Olga** |
| Factura de venta | `alegra_invoices` + `alegra_invoice_items` |

### Clientes: nunca se duplica

El orden de emparejado es: `alegra_id` ya guardado → teléfono / WhatsApp /
correo normalizados (gana la ficha **más antigua**) → documento → crear. **Nunca
se empareja solo por el nombre.** Al enlazar una ficha existente solo se
rellenan campos vacíos: no se pisa lo que escribió el mostrador. Es la misma
regla que usa el pedido de la tienda.

### Precio e ITBIS

`products.price` es CON ITBIS; Alegra da la lista «General» SIN ITBIS. **El
ITBIS sale de cada ítem**, no de una constante: en Alegra conviven ítems al
18 %, al 0 % y sin impuesto (`tax: []`), y estos últimos ya traen su precio
final. Aplicar 18 % a todos inflaba el precio de 273 productos.

### Stock

Se iguala al de Alegra en las dos sucursales con el mismo motor que la pantalla
*Inventario → Importar* (`buildImportPlan`), y deja un movimiento por producto
con referencia `ALEGRA-SYNC-YYYYMMDD-HHmm`. Los lotes en cuarentena y recall
quedan fuera. Un producto sin lote en Principal no puede recibir stock en la
segunda sucursal (no hay vencimiento del cual heredar): se reporta y se omite.

> **Consecuencia de sincronizar el stock a diario:** todo lo que se venda o
> despache en DermaLand tiene que quedar facturado en Alegra **ese mismo día**.
> Si no, a la mañana siguiente el stock vuelve al de Alegra y esas unidades
> «reaparecen».

## Qué NO hace

- No escribe en Alegra. El cliente HTTP solo tiene `GET`, y hay una prueba que
  falla si alguien le añade un método de escritura.
- No borra nada. Lo que desaparece de Alegra se marca inactivo; una factura
  anulada conserva su fila con estado `void`.
- No pisa un código de barras distinto: lo reporta en
  `productos-conflictos-codigo.json` para revisarlo a mano.

## Dos trampas de la API de Alegra (aprendidas a golpes)

**1. La paginación NO es estable si no se ordena.** Sin `order_field`, pedir
páginas con `start`/`limit` repite unos registros y **pierde otros**: el
2026-09-05 la lectura de ítems devolvía 1 486 únicos de 1 487 — el ítem 1076
dos veces y el 1115 ninguna. Consecuencias reales: un producto duplicado creado
y 64 líneas de factura sin producto. El cliente ahora pagina **ordenando por
`id`**, la única clave total, y además deduplica por id como segunda barrera.
Si algún día se pagina otro recurso, ordenarlo por `id` también.

**2. Hay contactos sin tipo.** 40 contactos vienen con `type: []` y sí facturan.
Un contacto sin tipo cuenta como cliente; si no, se queda sin ficha y sus
facturas sin cliente enlazado.

## El límite de peticiones de Alegra

La documentación dice 150/min y HTTP 429. **La realidad de esta cuenta es
100/min, y al pasarse responde HTTP 400** con `{"code":429,"message":"Too many
requests"}` en el cuerpo. El cliente espacia las peticiones a 600 ms en cuanto
lee `x-rate-limit-limit`, reconoce ese 400 y espera lo que diga
`x-rate-limit-reset`. Por eso un barrido completo tarda minutos, no segundos:

| Entidad | Peticiones | Tiempo aproximado |
|---|---|---|
| Contactos (6 523) | 218 | 2 min |
| Ítems (1 487) | 50 | 30 s |
| Facturas (histórico completo) | ~500 | 5-6 min |

## Cómo revisar una corrida

- **En la base:** `alegra_sync_runs` guarda inicio, fin, si fue bien, modo,
  si fue simulación, los conteos por entidad y los errores.
- **En disco:** `backups/alegra-sync-<fecha>/reporte.json` más, cuando aplica,
  `productos-a-crear.json`, `productos-cambia-precio.json`,
  `productos-conflictos-codigo.json`, `productos-a-desactivar.json`,
  `stock-omitidos.json` y `stock-no-cuadran.json`.
- **Los movimientos de stock** salen en *Inventario → Movimientos* con el motivo
  «Sincronización Alegra …».

## Facturas sin cliente o líneas sin producto

Al final de cada sincronización de facturas se hace un **re-enlace**: las
facturas que quedaron sin `client_id` y las líneas sin `product_id` se
completan con el mapeo actual. Así el historial se arregla solo a medida que
los contactos y los ítems van teniendo ficha. Lo que quede suelto conserva el
nombre del cliente y del producto, así que el historial se lee igual.

## Salvaguardas

- **Guardia anti-vacío:** si Alegra devuelve menos de la mitad de los ítems de
  la última corrida buena, no se desactiva ningún producto y la corrida queda
  marcada con error.
- **401:** aborta todo de inmediato; no se desactiva ni se cambia nada con datos
  a medias.
- Un fallo en una entidad se anota y **no** detiene a las demás.
- El `business_id` es constante del código; nunca sale de la API.

## Dónde se ve en la aplicación

| Pantalla | Qué muestra |
|---|---|
| Administración → Integración con Alegra | Estado de la última corrida, qué hay traído, historial y botón «Sincronizar ahora» |
| Ficha del cliente → «Compras en Alegra» | Sus facturas: comprobante, forma de pago, vendedor, total y saldo |
| Reportes → Ventas en Alegra | Rango y sucursal, con totales, por vendedor, por forma de pago, productos y día a día |
| Cuentas por cobrar → Saldos en Alegra | Pendiente por cliente con antigüedad, y el detalle factura por factura |

El botón «Sincronizar ahora» **no sincroniza en el servidor web**: le pide a
GitHub Actions que corra el mismo trabajo de las 6:00 a. m. Así el token de
Alegra vive únicamente en los secretos del workflow y una corrida a mano queda
registrada igual que la automática.

## Qué hay que configurar una sola vez

**Secretos del repositorio** (Settings → Secrets and variables → Actions), para
que el trabajo diario funcione:

| Secreto | De dónde sale |
|---|---|
| `ALEGRA_EMAIL` | Alegra → Configuración → API |
| `ALEGRA_TOKEN` | Alegra → Configuración → API |
| `NEXT_PUBLIC_SUPABASE_URL` | El mismo de `apps/web/.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | El mismo de `apps/web/.env.local` |

**Variable de entorno de la aplicación** (Vercel), solo para el botón
«Sincronizar ahora»:

| Variable | Qué es |
|---|---|
| `GITHUB_ACTIONS_TOKEN` | Token de GitHub de grano fino con permiso `actions: write` **solo** sobre este repositorio |

Sin `GITHUB_ACTIONS_TOKEN` todo lo demás funciona: la pantalla se ve, el
historial se lee y la sincronización sigue corriendo sola a las 6:00 a. m.; lo
único que se apaga es el botón, y la pantalla lo explica.

## Credenciales

`ALEGRA_EMAIL` y `ALEGRA_TOKEN` en `apps/web/.env.local` (ignorado por git) y,
para el trabajo diario, en los secretos de GitHub Actions. Se sacan de Alegra en
*Configuración → API - Integraciones con otros sistemas*. Si se renuevan allá,
hay que actualizarlos en los dos sitios.
