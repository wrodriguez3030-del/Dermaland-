"use client";

import * as React from "react";
import Link from "next/link";
import { Building2, Plus, Star, Power, RotateCcw, Boxes } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, Button, Card } from "@/components/ui";
import { RowActions } from "@/components/ui/row-actions";
import { useToast } from "@/components/ui/toast";
import { mockWarehouses } from "@/lib/mock-data/tenancy";
import {
  useBranches,
  setBranchActive,
  deleteBranch,
} from "@/features/tenancy/branch-store";
import { canManageBranches } from "@/features/tenancy/permissions";

export default function SucursalesPage() {
  const branches = useBranches();
  const toast = useToast();
  const canManage = canManageBranches();

  return (
    <>
      <PageHeader
        title="Sucursales"
        description="Sedes físicas del negocio. Cada sucursal tiene sus propios almacenes, caja y configuración fiscal."
        breadcrumbs={[{ label: "Administración" }, { label: "Sucursales" }]}
        actions={
          canManage ? (
            <Link href="/admin/sucursales/nueva">
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Nueva sucursal
              </Button>
            </Link>
          ) : undefined
        }
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {branches.map((b) => {
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
                  {canManage && (
                    <RowActions
                      viewHref={`/admin/sucursales/${b.id}`}
                      editHref={`/admin/sucursales/${b.id}/editar`}
                      onDelete={() => {
                        const res = deleteBranch(b.id);
                        if (!res.ok) toast.error(res.error);
                        else toast.success("Sucursal eliminada.");
                      }}
                      entityName={b.name}
                      customActions={[
                        b.status === "active"
                          ? {
                              label: "Inactivar",
                              icon: Power,
                              onClick: () => {
                                setBranchActive(b.id, false);
                                toast.success(`${b.name} inactivada.`);
                              },
                              confirm: {
                                title: "Inactivar sucursal",
                                message: `¿Seguro que deseas inactivar ${b.name}? No se borra inventario, movimientos ni ventas.`,
                              },
                            }
                          : {
                              label: "Reactivar",
                              icon: RotateCcw,
                              onClick: () => {
                                setBranchActive(b.id, true);
                                toast.success(`${b.name} reactivada.`);
                              },
                            },
                      ]}
                    />
                  )}
                </div>
              </div>

              <dl className="space-y-2 px-5 pb-5 text-sm">
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-xs uppercase tracking-wider opacity-50">
                    Dirección
                  </dt>
                  <dd className="opacity-80">
                    {b.address}
                    {b.city ? `, ${b.city}` : ""}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-xs uppercase tracking-wider opacity-50">
                    Teléfono
                  </dt>
                  <dd className="opacity-80">{b.phone ?? "—"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0 text-xs uppercase tracking-wider opacity-50">
                    Email
                  </dt>
                  <dd className="opacity-80">{b.email ?? "—"}</dd>
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
                  Ver detalle
                </Link>
                <Link
                  href={`/inventario?branch=${b.id}`}
                  className="inline-flex items-center gap-1 text-xs font-medium opacity-60 hover:opacity-100"
                >
                  <Boxes className="h-3.5 w-3.5" /> Ver inventario
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
