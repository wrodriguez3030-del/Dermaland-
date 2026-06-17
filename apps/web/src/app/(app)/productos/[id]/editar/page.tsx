"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui";
import { useProduct } from "@/features/products/product-store";
import { ProductForm } from "@/features/products/product-form";

export default function EditarProductoPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const product = useProduct(id);

  if (!product) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <PageHeader
          title="Producto no encontrado"
          breadcrumbs={[
            { label: "Productos", href: "/productos" },
            { label: id },
            { label: "Editar" },
          ]}
        />
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm opacity-70">
              No encontramos el producto con id <code>{id}</code>.
            </p>
            <Link
              href="/productos"
              className="mt-4 inline-block text-sm text-[color:var(--brand-accent)] hover:underline"
            >
              ← Volver a productos
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Link
        href={`/productos/${id}`}
        className="mb-4 inline-flex items-center gap-1 text-xs opacity-60 hover:opacity-100"
      >
        <ArrowLeft className="h-3 w-3" /> Volver al producto
      </Link>
      <PageHeader
        title={`Editar ${product.name}`}
        description={product.sku}
        breadcrumbs={[
          { label: "Productos", href: "/productos" },
          { label: product.sku, href: `/productos/${id}` },
          { label: "Editar" },
        ]}
      />

      <ProductForm mode="edit" product={product} />
    </div>
  );
}
