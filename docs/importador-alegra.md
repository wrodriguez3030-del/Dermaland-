# Importar inventario desde Alegra

Actualiza el stock de las dos sucursales con un solo archivo. Vive en
**Inventario → Importar desde Alegra** (`/inventario/importar`).

## Qué exportar de Alegra

El reporte de inventario que incluya las columnas `Producto/servicio`,
`Cantidad en Principal` y `Cantidad total` (sirve tanto "Valor de inventario"
como "Cantidad de productos"). No hace falta recortar columnas: el sistema las
ubica por el **nombre de la cabecera**, no por la posición, y tolera acentos,
mayúsculas y espacios de más.

## Qué hace con cada columna

| Columna de Alegra | Va a |
|---|---|
| `Cantidad en Principal` | Stock de **DermaLand Principal** |
| `Cantidad total` − `Cantidad en Principal` | Stock de **Dermaland Cutis** |

Alegra solo desglosa el almacén "Principal"; el resto del total se asume en
Cutis. Si alguna fila trae `Cantidad total` menor que `Cantidad en Principal`,
se reporta y se omite (la resta daría un negativo).

## Quién puede usarlo

`super_admin`, `admin` y `manager`. Los demás roles reciben 403 del servidor,
no solo un menú oculto.

## Qué NO hace

- **No toca precios, costos ni códigos de barra.** Solo cantidades.
- **No crea productos.** Las filas que no coinciden con exactamente un producto
  del catálogo se reportan y se omiten.
- **No importa vencimientos.** Cuando hay que crear stock en Cutis para un
  producto que no tenía lote ahí, el lote nuevo **hereda el vencimiento** de un
  lote que ese producto ya tenga en Principal, con este orden:
  1. El lote **con existencias** que vence antes.
  2. Si ninguno tiene existencias, el lote **recibido más recientemente**.
  3. Si la fecha que tocaría heredar **ya está vencida**, no se crea el lote: se
     reporta para que revises el vencimiento a mano. No queremos inventario que
     nazca bloqueado para venta.
  4. Si el producto no tiene ningún lote en Principal, se omite. Nunca se
     inventa una fecha.

## Cómo reparte los ajustes

- **Al bajar stock** consume por FEFO: primero el lote que vence antes, y sigue
  con el siguiente si el primero no alcanza.
- **Al subir stock** suma al lote recibido más recientemente.
- Si el objetivo ya coincide con lo que hay, no genera ningún ajuste (puedes
  aplicar el mismo archivo dos veces sin efecto).

## "Poner en cero los productos que no aparezcan en el archivo"

Casilla opcional, **apagada por defecto**. Encendida, trata el archivo como el
inventario COMPLETO: todo producto del catálogo que no venga en el archivo queda
en 0.

**Salvaguarda:** si el archivo trae filas que no coinciden con el catálogo o que
se omiten por datos inválidos, el sistema **rechaza** la operación con la casilla
encendida, tanto en la vista previa como al aplicar. El motivo es concreto: una
fila que sí viene en el archivo pero cuyo nombre no empareja quedaría tratada
como "ausente", y le borraría el stock a un producto que el archivo declara con
existencias. Revisa primero esas filas.

## Cómo revisar o revertir

Cada producto ajustado deja un movimiento en **Inventario → Movimientos** con la
referencia `ALEGRA-YYYYMMDD-HHmm`, que la pantalla te muestra al terminar.

> **Ojo:** la pantalla de Movimientos todavía **no filtra por referencia** (su
> caja de búsqueda no está conectada). Por ahora los movimientos de una
> importación se identifican por su fecha y por el motivo "Importación Alegra".
> La fecha y hora de la referencia están en **UTC**, no en hora dominicana: una
> importación a las 21:00 del 1 de agosto se sella `ALEGRA-20260802-0100`.

Si un producto falla a mitad del proceso, el sistema **revierte** los lotes que
ya había tocado para ese producto y te lo reporta indicando si el stock quedó
aplicado o no. No se queda nunca en el estado "stock cambiado sin bitácora".

## Antes de la primera vez

Toma un respaldo:

```bash
node scripts/backup/rest-json-backup.mjs
node scripts/backup/verify-backup-integrity.mjs
```

## Ojo con las ventas posteriores al export

El archivo es una foto del momento en que lo exportaste. Si DermaLand facturó
después de esa foto, aplicar el archivo **devuelve al stock las unidades
vendidas**. Exporta de Alegra justo antes de importar, y preferiblemente fuera
del horario de facturación.

## Alternativa por línea de comandos

Existe `scripts/import-stock-principal-from-alegra.mjs`, que hace lo mismo solo
para Principal y corre con dry-run por defecto. Se usó el 2026-08-01 para la
carga inicial (40 889 → 2 312 unidades). La pantalla es el camino normal; el
script queda como herramienta de respaldo y para cargas guionizadas.

## Celdas de cantidad que el sistema NO acepta

Una celda de cantidad que no sea un entero limpio hace que **esa fila se omita**
y aparezca en "Filas que no se aplican": celda vacía, `-`, `N/A`, texto libre o
un decimal como `3.7`. Es deliberado: como la escritura es absoluta, tratar esas
celdas como `0` **borraría** el stock de ese producto en las dos sucursales sin
avisarte. Un `0` escrito explícitamente en el archivo sí vale como cero.

Los números con separador de millar (`1,234`, `1.234`, `2 312`) se leen
correctamente; no se truncan.

## Lotes que el importador no toca

Los lotes en **cuarentena** y en **recall** quedan fuera por completo: no cuentan
para el stock actual ni pueden recibir un ajuste. Se gestionan en sus propias
pantallas. Esto evita que un retiro sanitario se drene para cuadrar el número de
Alegra.

## Deuda conocida

- El movimiento de un producto con **varios lotes** ajustados se registra contra
  el primer lote por el total del cambio, no uno por lote. La trazabilidad por
  lote individual queda incompleta en ese caso.
- La escritura es **absoluta** sobre la foto leída al iniciar: si el POS vende
  durante la corrida, la importación puede restaurar esas unidades. De ahí la
  recomendación de correrlo fuera de horario.
- Los lotes creados en Cutis entran con **costo unitario 0**, así que no suman a
  la valorización del inventario hasta que se corrijan.
