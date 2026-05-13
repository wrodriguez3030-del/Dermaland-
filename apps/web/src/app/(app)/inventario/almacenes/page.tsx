"use client";

import { PageHeader } from "@/components/layout/page-header";
import { Badge, Button, Card, CardContent } from "@/components/ui";
import { Plus, Warehouse as WarehouseIcon } from "lucide-react";
import { RowActions } from "@/components/ui/row-actions";
import { useLocalSoftDelete } from "@/components/ui/use-local-soft-delete";
import { useToast } from "@/components/ui/toast";
import { mockBranches, mockWarehouses } from "@/lib/mock-data/tenancy";

export default function AlmacenesPage() {
  const { visible, hide } = useLocalSoftDelete(mockWarehouses);
  const toast = useToast();
  return (
    <>
      <PageHeader
        title="Almacenes"
        description="Cada sucursal puede tener varios almacenes (principal, góndolas, depósito). Stock se gestiona por almacén."
        breadcrumbs={[
          { label: "Inventario", href: "/inventario" },
          { label: "Almacenes" },
        ]}
        actions={
          <Button size="sm">
            <Plus className="h-4 w-4" />
            Nuevo almacén
          </Button>
        }
      />

      <div className="space-y-6">
        {mockBranches.map((b) => {
          const items = visible.filter((w) => w.branchId === b.id);
          return (
            <div key={b.id}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                {b.name}
                <span className="text-xs font-normal opacity-50">·</span>
                <span className="text-xs font-normal opacity-50">{b.code}</span>
              </h2>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {items.length === 0 && (
                  <Card>
                    <CardContent className="text-sm opacity-60">
                      Sin almacenes — crea el principal.
                    </CardContent>
                  </Card>
                )}
                {items.map((w) => (
                  <Card key={w.id}>
                    <CardContent className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-[color:var(--brand-primary)]/10 text-[color:var(--brand-accent)]">
                        <WarehouseIcon className="h-4 w-4" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{w.name}</span>
                          {w.isMain && (
                            <Badge tone="primary" outlined>
                              Principal
                            </Badge>
                          )}
                        </div>
                        <div className="mt-0.5 text-xs opacity-60 font-mono">
                          {w.code}
                        </div>
                        {w.description && (
                          <p className="mt-1 text-xs opacity-70">
                            {w.description}
                          </p>
                        )}
                      </div>
                      <RowActions
                        viewHref={`/inventario/almacenes/${w.id}`}
                        editHref={`/inventario/almacenes/${w.id}/editar`}
                        onDelete={() => {
                          hide(w.id);
                          toast.success("Almacén eliminado correctamente.");
                        }}
                        entityName={w.name}
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <toast.Toast />
    </>
  );
}
