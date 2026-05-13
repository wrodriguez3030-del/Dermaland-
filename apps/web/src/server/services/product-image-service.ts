// Server-only: este módulo se importa desde route handlers / server actions.
// `import "server-only"` se reactiva cuando exista implementación real con
// `createServiceRoleClient()`. Mientras tanto evitamos la dep para que vitest
// pueda testear la función pura `pathForProduct`.
import { isSupabaseConfigured } from "@/lib/env";

/**
 * Servicio de imágenes de producto.
 *
 * MVP: las imágenes viven en `public/mock/products/*` o como data URL
 * (base64) en el `dermaland.products` localStorage del cliente.
 *
 * Producción: cada imagen se sube a Supabase Storage en bucket privado
 * `product-images`, con path `businesses/{businessId}/products/{productId}/image.webp`.
 * Reglas de seguridad: solo usuarios del business pueden subir/ver sus propias
 * imágenes (RLS sobre la tabla `products` + storage policy mirroring).
 *
 * Por ahora todos los métodos son stubs que lanzan si Supabase no está
 * configurado, o devuelven la URL pública firmada cuando lo esté.
 */

export class ProductImageNotConfigured extends Error {
  constructor() {
    super(
      "Supabase Storage no configurado. Las imágenes en MVP viven en public/mock/products/* o data URL.",
    );
    this.name = "ProductImageNotConfigured";
  }
}

const BUCKET = "product-images";

function pathForProduct(businessId: string, productId: string): string {
  return `businesses/${businessId}/products/${productId}/image.webp`;
}

export interface ProductImageService {
  uploadProductImage(
    file: File | Blob,
    productId: string,
    businessId: string,
  ): Promise<string>;
  deleteProductImage(productId: string, businessId: string): Promise<void>;
  getProductImageUrl(productId: string, businessId: string): Promise<string | null>;
}

class ProductImageServiceImpl implements ProductImageService {
  async uploadProductImage(
    _file: File | Blob,
    _productId: string,
    _businessId: string,
  ): Promise<string> {
    if (!isSupabaseConfigured()) throw new ProductImageNotConfigured();
    // Implementación real:
    //   const sb = createServiceRoleClient();
    //   const path = pathForProduct(businessId, productId);
    //   await sb.storage.from(BUCKET).upload(path, file, {
    //     contentType: "image/webp",
    //     upsert: true,
    //   });
    //   const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
    //   return data.publicUrl;
    throw new ProductImageNotConfigured();
  }

  async deleteProductImage(
    _productId: string,
    _businessId: string,
  ): Promise<void> {
    if (!isSupabaseConfigured()) throw new ProductImageNotConfigured();
    // sb.storage.from(BUCKET).remove([pathForProduct(...)])
    throw new ProductImageNotConfigured();
  }

  async getProductImageUrl(
    _productId: string,
    _businessId: string,
  ): Promise<string | null> {
    if (!isSupabaseConfigured()) return null;
    // const { data } = sb.storage.from(BUCKET).getPublicUrl(pathForProduct(...));
    // return data.publicUrl;
    return null;
  }
}

export const productImageService: ProductImageService = new ProductImageServiceImpl();

export const __test__ = { BUCKET, pathForProduct };
