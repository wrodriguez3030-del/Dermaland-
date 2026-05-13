# DermaLand · imágenes mock de productos

Carpeta servida estáticamente por Next.js bajo `/mock/products/*`.

Las rutas usadas en `mockProducts` (ver `src/lib/mock-data/catalog.ts`) apuntan
aquí:

- `lrp-toleriane.jpg`
- `eucerin-pigment-spf50.jpg`
- `sesderma-cvit-serum.jpg`
- `isdin-fusion-water.jpg`
- _(añadir más a medida que el cliente entregue fotos reales)_

Si no existe la imagen, el componente `<ProductImage>` renderiza un placeholder
con las iniciales del producto sobre fondo de marca — la app no se rompe.

## Cómo agregar una imagen real

1. Convertir a JPG / PNG / WebP, máximo 800×800 px, peso < 200 KB.
2. Copiar al filename exacto que apunta el seed.
3. Reload — Next sirve los assets en hot-reload.

## Producción

Estas imágenes son solo para el seed/demo. En producción cada business sube las
suyas vía `<ProductImageUploader>` y se almacenan en Supabase Storage.
Detalle en `docs/product-images.md`.
