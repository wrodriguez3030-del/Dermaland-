"use client";

import { ProductForm } from "@/features/products/product-form";

/** Alta de producto — reutiliza `ProductForm` en modo creación. */
export function NewProductForm() {
  return <ProductForm mode="create" />;
}
