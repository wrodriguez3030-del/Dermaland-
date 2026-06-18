"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button, Card, CardContent } from "@/components/ui";
import { RowActions } from "@/components/ui/row-actions";
import { useToast } from "@/components/ui/toast";
import { CatalogFormDialog } from "@/features/products/catalog-form-dialog";
import {
  useBrandsList, saveBrand, deleteBrandAnywhere, CATALOG_BACKEND,
} from "@/features/products/catalog-store";

export default function MarcasPage() {
  const brands = useBrandsList();
  const toast = useToast();
  const [dialog, setDialog] = React.useState<{ mode: "create" | "edit"; id?: string; initial?: Record<string, string> } | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const isLocal = CATALOG_BACKEND === "local";

  const onSubmit = async (values: Record<string, string>) => {
    setSubmitting(true); setError(null);
    const res = await saveBrand(dialog!.mode, { name: values.name ?? "" }, dialog?.id);
    setSubmitting(false);
    if (!res.ok) { setError(res.error); return; }
    toast.success(dialog!.mode === "create" ? "Marca creada." : "Cambios guardados.");
    setDialog(null);
  };

  return (
    <>
      <PageHeader
        title="Marcas"
        description="Marcas del catálogo DermaLand."
        breadcrumbs={[{ label: "Productos", href: "/productos" }, { label: "Marcas" }]}
        actions={
          <Button size="sm" onClick={() => { setError(null); setDialog({ mode: "create", initial: {} }); }}>
            <Plus className="h-4 w-4" /> Nueva marca
          </Button>
        }
      />
      <div className={`mb-4 rounded-xl border px-4 py-2.5 text-xs ${isLocal ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
        {isLocal
          ? "Los cambios se guardan en este equipo (modo demo, sin Supabase)."
          : "Las marcas son una fuente única compartida (Supabase). Los cambios se ven en todos los equipos."}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {brands.map((b) => (
          <Card key={b.id}>
            <CardContent className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{b.name}</div>
                <div className="mt-0.5 text-xs opacity-60">{b.productCount} productos</div>
              </div>
              <RowActions
                viewHref={`/productos?brand=${b.id}`}
                onEdit={() => { setError(null); setDialog({ mode: "edit", id: b.id, initial: { name: b.name } }); }}
                onDelete={async () => {
                  const res = await deleteBrandAnywhere(b.id);
                  if (!res.ok) toast.error(res.error);
                  else toast.success("Marca eliminada.");
                }}
                entityName={b.name}
              />
            </CardContent>
          </Card>
        ))}
      </div>

      <CatalogFormDialog
        open={dialog !== null}
        title={dialog?.mode === "edit" ? "Editar marca" : "Nueva marca"}
        fields={[{ key: "name", label: "Nombre", required: true }]}
        initial={dialog?.initial}
        submitting={submitting}
        error={error}
        onClose={() => setDialog(null)}
        onSubmit={onSubmit}
      />
      <toast.Toast />
    </>
  );
}
