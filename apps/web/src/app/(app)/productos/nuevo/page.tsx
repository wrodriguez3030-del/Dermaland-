import { PageHeader } from "@/components/layout/page-header";
import { NewProductForm } from "@/features/products/new-product-form";

export default function NuevoProductoPage() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Nuevo producto"
        description="Crea un producto. Puedes asociar lotes después en la pestaña Inventario."
        breadcrumbs={[
          { label: "Productos", href: "/productos" },
          { label: "Nuevo" },
        ]}
      />
      <NewProductForm />
    </div>
  );
}
