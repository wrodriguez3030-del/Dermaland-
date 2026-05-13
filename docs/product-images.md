# DermaLand · Imágenes de productos

Cómo se manejan las fotos de producto en MVP y producción.

## Modelo

`Product.imageUrl` (string opcional) + `Product.imageAlt` (string opcional).
Cualquier productor puede:
- Apuntar a una ruta estática (`/mock/products/*` para el seed).
- Usar una **data URL** base64 (lo que hace el `<ProductImageUploader>` en MVP).
- En producción, ser una URL pública firmada de Supabase Storage.

## MVP

### Subida desde la UI
`<ProductImageUploader>` (en `src/features/products/components/`) lee el archivo
con `FileReader.readAsDataURL`, valida formato/tamaño, y emite un `data:image/...`
data URL al padre. El padre lo persiste en `localStorage` como parte del producto:

- `dermaland.products` para productos creados nuevos.
- `dermaland.products.overrides` para edición de productos del seed.

Validaciones:
- Formatos: `image/jpeg`, `image/png`, `image/webp`.
- Tamaño máximo: 2 MB.
- Errores se muestran inline; el valor previo se conserva.

### Display
`<ProductImage>` muestra la imagen y, si falla la carga (404, error CORS, etc.),
renderiza un placeholder con las iniciales del producto sobre fondo de marca.
La app nunca se rompe por imágenes faltantes.

### Limitaciones
- `localStorage` tiene ~5–10 MB. 4–5 imágenes de 2 MB lo saturan.
- Las data URLs viajan en cada render del HTML — afectan el peso de la página.
- No hay procesamiento (resize, conversión a WebP, recorte cuadrado).

Documentado en `riesgos.md` → R-IMG-01.

## Producción

### Bucket
- Bucket: `product-images` en Supabase Storage.
- Modo: **privado**. Acceso vía URLs firmadas con TTL 1 hora.
- Path: `businesses/{businessId}/products/{productId}/image.webp`.

### Pipeline al subir
1. Cliente: el formulario sube el `File` directo (no data URL) a un endpoint
   `POST /api/products/{id}/image`.
2. Server action: valida tipo/tamaño, **redimensiona** a 800×800 px y **convierte
   a WebP** con `sharp`, **comprime** a calidad 80.
3. Sube al path canónico vía `supabase.storage.from("product-images").upload(path, buffer)`.
4. Actualiza `products.image_url` con la URL pública firmada (o solo la path
   relativa y firmar al leer).

### Storage policies
```sql
-- Solo usuarios del mismo business pueden leer/escribir su carpeta.
create policy "tenant_read"
  on storage.objects for select
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[2] = auth.business_id()::text
  );

create policy "tenant_write"
  on storage.objects for insert with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[2] = auth.business_id()::text
  );
```

### Migración MVP → producción
1. Generar plan: por cada producto con `imageUrl` que arranca con `data:`,
   subir el blob al bucket en su path canónico, actualizar `imageUrl` con la
   URL pública.
2. `localStorage.removeItem("dermaland.products.overrides")` tras migrar.
3. Para imágenes en `/mock/products/*` (seed), copiar a Supabase si las usa
   producción, o seguir sirviéndolas estáticamente como assets de la app.

## Ubicaciones

| Path | Propósito |
|---|---|
| `apps/web/public/mock/products/*` | Imágenes seed (drop-in para el cliente) |
| `src/features/products/components/product-image.tsx` | Thumbnail con placeholder |
| `src/features/products/components/product-image-uploader.tsx` | Uploader |
| `src/features/products/product-store.ts` | localStorage layer |
| `src/server/services/product-image-service.ts` | Stub Supabase Storage |

## Cuándo migrar a Supabase

Cualquiera de estos triggers:
- Cliente carga > 50 imágenes (limite localStorage).
- Cliente quiere ver imágenes en otra PC (sync entre dispositivos).
- Catálogo público (`/catalogo` Fase 9) — necesita URLs accesibles sin auth.
