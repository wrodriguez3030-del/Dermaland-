"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ScanBarcode } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button, Card, CardContent, Input, Label, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { useActiveBranches, useCurrentBranch } from "@/features/tenancy/branch-store";
import { useBrandsList, useCategoriesList, useLaboratoriesList } from "@/features/products/catalog-store";
import { createSession } from "@/features/inventory-counts/scan-session-store";

export default function NuevoInventarioPage() {
  const router = useRouter();
  const toast = useToast();
  const branches = useActiveBranches();
  const { branchId: currentBranchId } = useCurrentBranch();
  const categories = useCategoriesList();
  const brands = useBrandsList();
  const laboratories = useLaboratoriesList();

  const [name, setName] = React.useState("");
  const [branchId, setBranchId] = React.useState("");
  const [type, setType] = React.useState<"full" | "partial" | "spot">("full");
  const [categoryId, setCategoryId] = React.useState("");
  const [brandId, setBrandId] = React.useState("");
  const [laboratoryId, setLaboratoryId] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!branchId && currentBranchId) setBranchId(currentBranchId);
  }, [currentBranchId, branchId]);

  const submit = () => {
    setError(null);
    if (!name.trim()) return setError("Ponle un nombre al inventario.");
    if (!branchId) return setError("Selecciona la sucursal.");
    const session = createSession({
      name: name.trim(),
      branchId,
      type,
      categoryId: categoryId || undefined,
      brandId: brandId || undefined,
      laboratoryId: laboratoryId || undefined,
      notes: notes || undefined,
    });
    toast.success("Inventario creado. ¡A escanear!");
    router.push(`/conteo-fisico/${session.id}/escanear`);
  };

  return (
    <>
      <PageHeader
        title="Nuevo inventario físico"
        description="Crea un inventario y empieza a escanear productos para contar el stock real."
        breadcrumbs={[{ label: "Inventario físico", href: "/conteo-fisico" }, { label: "Nuevo inventario" }]}
      />

      <Card className="max-w-2xl">
        <CardContent className="space-y-4 p-5">
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{error}</div>
          )}

          <div>
            <Label>Nombre del inventario *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Inventario general junio 2026" autoFocus />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Sucursal *</Label>
              <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">— Selecciona —</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Tipo *</Label>
              <Select value={type} onChange={(e) => setType(e.target.value as "full" | "partial" | "spot")}>
                <option value="full">Inventario total</option>
                <option value="partial">Inventario parcial</option>
                <option value="spot">Spot check</option>
              </Select>
            </div>
            <div>
              <Label>Categoría (opcional)</Label>
              <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Todas</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Marca (opcional)</Label>
              <Select value={brandId} onChange={(e) => setBrandId(e.target.value)}>
                <option value="">Todas</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Laboratorio (opcional)</Label>
              <Select value={laboratoryId} onChange={(e) => setLaboratoryId(e.target.value)}>
                <option value="">Todos</option>
                {laboratories.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label>Nota (opcional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Detalles del inventario…" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => router.push("/conteo-fisico")}>
              Cancelar
            </Button>
            <Button onClick={submit}>
              <ScanBarcode className="h-4 w-4" /> Crear y empezar a escanear
            </Button>
          </div>
        </CardContent>
      </Card>

      <toast.Toast />
    </>
  );
}
