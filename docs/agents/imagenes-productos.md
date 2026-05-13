# Agente Imágenes de Productos

## Objetivo

Conseguir, descargar y asociar fotos a los productos del catálogo.
Mantener la coherencia entre `imageUrl`, `imageStatus` y los archivos
físicos en `public/mock/products/`. Generar reporte auditable.

## Responsabilidades

- Buscar fotos de productos (fuentes públicas, web del fabricante,
  marketplaces autorizados).
- Descargar las imágenes y guardarlas en
  `apps/web/public/mock/products/<slug>.jpg`.
- Actualizar el mock data:
  - `imageUrl` → `/mock/products/<slug>.jpg`
  - `imageAlt` → texto descriptivo (marca + producto + presentación)
  - `imageSourceUrl` → URL de origen (auditoría)
  - `imageStatus` → `ok` | `pending` | `placeholder` | `manual-review`
- Generar reporte JSON en `data/product-image-import-report.json` con
  por producto: `id`, `slug`, `imageUrl`, `imageStatus`, `imageSourceUrl`,
  `notes`.
- No alterar nada que no sea las cuatro propiedades de imagen.

## Archivos que suele tocar

- `apps/web/public/mock/products/**` (los `.jpg` / `.png` / `.webp`)
- `apps/web/src/lib/mock-data/products.ts` (sólo campos de imagen)
- `data/product-image-import-report.json` (generado)
- `docs/product-images.md` (notas de proceso)

No toca:

- IDs, SKUs, precios, stock, lotes, vencimientos. Si encuentra que un
  producto necesita un cambio en estos campos, pasa al agente
  Inventario.

## Errores que debe detectar

- Imagen rota (404 al cargar la URL pública).
- Imagen guardada con extensión incorrecta o sin ella.
- `imageUrl` apuntando a una ruta absoluta del FS local en vez de la
  ruta pública (`/mock/products/...`).
- `imageAlt` vacío o genérico (`producto`, `imagen`).
- Producto al que se le cambió SKU / precio / stock por accidente.
- Reporte JSON sin actualizar tras un batch.
- Imágenes con derechos restrictivos (logos sin licencia, fotos con
  marca de agua).

## Checklist de salida

- [ ] Cada imagen está en `apps/web/public/mock/products/` con un slug
      consistente (`<marca>-<producto>-<presentacion>.<ext>`,
      lowercase, kebab-case).
- [ ] `imageUrl` usa ruta pública (`/mock/products/...`).
- [ ] `imageAlt` describe el producto en una frase útil.
- [ ] `imageSourceUrl` está presente para trazabilidad.
- [ ] `imageStatus` es uno de `ok | pending | placeholder |
      manual-review`.
- [ ] No se modificó ningún otro campo del producto.
- [ ] `data/product-image-import-report.json` actualizado.
- [ ] El servidor sirve la imagen sin 404 (probar al menos 2-3 a mano).

## Prompt de uso

```
Actúa como Agente Imágenes de Productos de DermaLand.

Lee primero docs/agents/imagenes-productos.md y docs/product-images.md.

Tarea:
<lista de productos a procesar, o "todos los pendientes">

Trabaja sólo dentro de:
- apps/web/public/mock/products/**
- apps/web/src/lib/mock-data/products.ts (sólo campos de imagen)
- data/product-image-import-report.json
- docs/product-images.md

Reglas:
- Guarda imágenes en /mock/products/<slug>.<ext>.
- Actualiza sólo imageUrl, imageAlt, imageSourceUrl, imageStatus.
- No tocar IDs, SKUs, precios, stock, lotes.
- Reporta cada producto procesado en
  data/product-image-import-report.json.
- Si una imagen no se puede conseguir, marca imageStatus = "pending" o
  "manual-review" y documenta por qué.

Tras terminar, corre el checklist de validación rápida (al menos
typecheck + build) y reporta totales: ok / pending / manual-review /
placeholder.
```

## Criterios de aceptación

- Reporte JSON cuadra con la cantidad de productos procesados.
- typecheck + build pasan (los nuevos paths de imagen son válidos).
- Una muestra aleatoria de 3 productos abre la imagen sin 404 vía
  `http://localhost:3031/mock/products/<slug>.jpg`.
- Ningún campo no autorizado fue modificado (revisable con git diff).
