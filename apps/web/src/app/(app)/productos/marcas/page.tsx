"use client";

import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button, Card, CardContent } from "@/components/ui";
import { RowActions } from "@/components/ui/row-actions";
import { useLocalSoftDelete } from "@/components/ui/use-local-soft-delete";
import { useToast } from "@/components/ui/toast";
import { mockBrands } from "@/lib/mock-data/catalog";

export default function MarcasPage() {
  const { visible, hide } = useLocalSoftDelete(mockBrands);
  const toast = useToast();
  return (
    <>
      <PageHeader
        title="Marcas"
        description="Marcas reales del catálogo inicial DermaLand (extraídas del CSV de Alegra)."
        breadcrumbs={[
          { label: "Productos", href: "/productos" },
          { label: "Marcas" },
        ]}
        actions={
          <Button size="sm">
            <Plus className="h-4 w-4" />
            Nueva marca
          </Button>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {visible.map((b) => (
          <Card key={b.id}>
            <CardContent className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{b.name}</div>
                <div className="mt-0.5 text-xs opacity-60">
                  {b.productCount} productos
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[color:var(--brand-primary)]/10 px-2 py-1 text-[10px] font-semibold text-[color:var(--brand-accent)]">
                  {b.name.slice(0, 2)}
                </span>
                <RowActions
                  viewHref={`/productos?brand=${b.id}`}
                  editHref={`/productos/marcas/${b.id}/editar`}
                  onDelete={() => {
                    hide(b.id);
                    toast.success("Marca eliminada correctamente.");
                  }}
                  entityName={b.name}
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
