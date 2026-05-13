"use client";

import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button, Card, CardContent } from "@/components/ui";
import { RowActions } from "@/components/ui/row-actions";
import { useLocalSoftDelete } from "@/components/ui/use-local-soft-delete";
import { useToast } from "@/components/ui/toast";
import { mockCategories } from "@/lib/mock-data/catalog";

export default function CategoriasPage() {
  const { visible, hide } = useLocalSoftDelete(mockCategories);
  const toast = useToast();
  return (
    <>
      <PageHeader
        title="Categorías"
        description="Agrupación funcional para filtros, reportes y SEO del sitio web."
        breadcrumbs={[
          { label: "Productos", href: "/productos" },
          { label: "Categorías" },
        ]}
        actions={
          <Button size="sm">
            <Plus className="h-4 w-4" />
            Nueva categoría
          </Button>
        }
      />
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {visible.map((c) => (
          <Card key={c.id}>
            <CardContent>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold">{c.name}</h3>
                  <p className="mt-1 text-xs opacity-60">{c.description ?? "—"}</p>
                </div>
                <RowActions
                  viewHref={`/productos?category=${c.id}`}
                  editHref={`/productos/categorias/${c.id}/editar`}
                  onDelete={() => {
                    hide(c.id);
                    toast.success("Categoría eliminada correctamente.");
                  }}
                  entityName={c.name}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <toast.Toast />
    </>
  );
}
