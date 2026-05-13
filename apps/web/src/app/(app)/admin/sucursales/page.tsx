"use client";

import Link from "next/link";
import { Building2, Plus, Star } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, Button, Card } from "@/components/ui";
import { RowActions } from "@/components/ui/row-actions";
import { useLocalSoftDelete } from "@/components/ui/use-local-soft-delete";
import { useToast } from "@/components/ui/toast";
import { mockBranches, mockWarehouses } from "@/lib/mock-data/tenancy";

export default function SucursalesPage() {
  const { visible, hide } = useLocalSoftDelete(mockBranches);
  const toast = useToast();

  return (
    <>
      <PageHeader
        title="Sucursales"
        description="Sedes físicas del negocio. Cada sucursal tiene sus propios almacenes, caja y configuración fiscal."
        breadcrumbs={[{ label: "Administración" }, { label: "Sucursales" }]}
        actions={
          <Button size="sm">
            <Plus className="h-4 w-4" />
            Nueva sucursal
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {visible.map((b) => {
          const warehouses = mockWarehouses.filter((w) => w.branchId === b.id);
          return (
            <Card key={b.id} className="overflow-hidden">
              <div className="flex items-start justify-between gap-3 p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--brand-primary)]/10 text-[color:var(--brand-accent)]">
                    <Building2 className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold">{b.name}</h3>
                      {b.isPilot && (
                        <Badge tone="primary" outlined>
                          <Star className="h-3 w-3" /> Piloto
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs opacity-60">{b.code}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Badge tone={b.status === "active" ? "success" : "neutral"}>
                    {b.status === "active" ? "Activa" : "Inactiva"}
                  </Badge>
                  <RowActions
                    viewHref={`/admin/sucursales/${b.id}`}
                    editHref={`/admin/sucursales/${b.id}/editar`}
                    onDelete={() => {
                      hide(b.id);
                      toast.success("Sucursal eliminada correctamente.");
                    }}
                    entityName={b.name}
                  />
                </div>
              </div>

              <dl className="space-y-2 px-5 pb-5 text-sm">
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-xs uppercase tracking-wider opacity-50">
                    Dirección
                  </dt>
                  <dd className="opacity-80">
                    {b.address}, {b.city}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-xs uppercase tracking-wider opacity-50">
                    Teléfono
                  </dt>
                  <dd className="opacity-80">{b.phone}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-xs uppercase tracking-wider opacity-50">
                    Email
                  </dt>
                  <dd className="opacity-80">{b.email}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-xs uppercase tracking-wider opacity-50">
                    Almacenes
                  </dt>
                  <dd className="opacity-80">
                    {warehouses.length === 0
                      ? "—"
                      : warehouses.map((w) => w.code).join(", ")}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-xs uppercase tracking-wider opacity-50">
                    Web
                  </dt>
                  <dd>
                    <Badge tone={b.showOnWebsite ? "info" : "neutral"}>
                      {b.showOnWebsite ? "Visible" : "Oculta"}
                    </Badge>
                  </dd>
                </div>
              </dl>

              <div className="flex items-center justify-between border-t border-black/5 bg-black/[0.015] px-5 py-3">
                <Link
                  href={`/admin/sucursales/${b.id}`}
                  className="text-xs font-medium text-[color:var(--brand-accent)] hover:underline"
                >
                  Detalles
                </Link>
                <Link
                  href={`/inventario?branch=${b.id}`}
                  className="text-xs font-medium opacity-60 hover:opacity-100"
                >
                  Ver inventario →
                </Link>
              </div>
            </Card>
          );
        })}
      </div>
      <toast.Toast />
    </>
  );
}
