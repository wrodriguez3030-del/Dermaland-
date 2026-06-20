# DermaLand · imágenes mock de productos

Carpeta servida estáticamente por Next.js bajo `/mock/products/*`.

## Estado actual (2026-06-16)

Los 12 productos del seed (`src/lib/mock-data/catalog.ts`) **ya no usan archivos
locales**: cada `imageUrl` apunta a una **URL externa** de la imagen real del
producto (CDN de fabricante/retailer), con `imageSourceUrl` para auditoría e
`imageStatus: "linked"`.

- Todas las URLs fueron verificadas (HTTP 200 + `content-type: image/*`).
- Reporte auditable: `data/product-image-import-report.json`.
- Riesgo conocido: **link rot** (el CDN externo puede retirar la imagen). Si una
  imagen desaparece, `<ProductImage>` cae al placeholder con iniciales — la app
  no se rompe. Reverificar con el reporte cuando haga falta.

## Cómo agregar / reemplazar una imagen

**Opción A — URL externa (lo que se usa hoy):** poné la URL directa de la imagen
en `imageUrl`, su página de origen en `imageSourceUrl` e `imageStatus: "linked"`.
Verificá antes que la URL devuelve `200 image/*`.

**Opción B — archivo local:** convertir a JPG/PNG/WebP (máx. 800×800 px, < 200 KB),
copiar a esta carpeta como `/mock/products/<slug>.<ext>` y apuntar `imageUrl` a esa
ruta con `imageStatus: "downloaded"`.

## Producción

Estas imágenes son solo para el seed/demo. En producción cada business sube las
suyas vía `<ProductImageUploader>` y se almacenan en Supabase Storage.
Detalle en `docs/product-images.md`.
