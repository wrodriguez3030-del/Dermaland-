"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button, Card, CardContent } from "@/components/ui";
import { RowActions } from "@/components/ui/row-actions";
import { useToast } from "@/components/ui/toast";
import { CatalogFormDialog } from "@/features/products/catalog-form-dialog";
import {
  useCategoriesList, saveCategory, deleteCategoryAnywhere, CATALOG_BACKEND,
} from "@/features/products/catalog-store";

export default function CategoriasPage() {
  const categories = useCategoriesList();
  const toast = useToast();
  const [dialog, setDialog] = React.useState<{ mode: "create" | "edit"; id?: string; initial?: Record<string, string> } | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const isLocal = CATALOG_BACKEND === "local";

  const onSubmit = async (values: Record<string, string>) => {
    setSubmitting(true); setError(null);
    const res = await saveCategory(dialog!.mode, { name: values.name ?? "", description: values.description }, dialog?.id);
    setSubmitting(false);
    if (!res.ok) { setError(res.error); return; }
    toast.success(dialog!.mode === "create" ? "Categoría creada." : "Cambios guardados.");
    setDialog(null);
  };

  return (
    <>
      <PageHeader
        title="Categorías"
        description="Categorías de productos."
        breadcrumbs={[{ label: "Productos", href: "/productos" }, { label: "Categorías" }]}
        actions={
          <Button size="sm" onClick={() => { setError(null); setDialog({ mode: "create", initial: {} }); }}>
            <Plus className="h-4 w-4" /> Nueva categoría
          </Button>
        }
      />
      <div className={`mb-4 rounded-xl border px-4 py-2.5 text-xs ${isLocal ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
        {isLocal
          ? "Los cambios se guardan en este equipo (modo demo, sin Supabase)."
          : "Las categorías son una fuente única compartida (Supabase)."}
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {categories.map((c) => (
          <Card key={c.id}>
            <CardContent>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold">{c.name}</h3>
                  <p className="mt-1 text-xs opacity-60">{c.description ?? "—"}</p>
                </div>
                <RowActions
                  viewHref={`/productos?category=${c.id}`}
                  onEdit={() => { setError(null); setDialog({ mode: "edit", id: c.id, initial: { name: c.name, description: c.description ?? "" } }); }}
                  onDelete={async () => {
                    const res = await deleteCategoryAnywhere(c.id);
                    if (!res.ok) toast.error(res.error);
                    else toast.success("Categoría eliminada.");
                  }}
                  entityName={c.name}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <CatalogFormDialog
        open={dialog !== null}
        title={dialog?.mode === "edit" ? "Editar categoría" : "Nueva categoría"}
        fields={[
          { key: "name", label: "Nombre", required: true },
          { key: "description", label: "Descripción", type: "textarea" },
        ]}
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
