"use client";

import * as React from "react";
import Link from "next/link";
import { Building2, Plus, Star, Power, RotateCcw, Boxes, RefreshCw, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, Button, Card } from "@/components/ui";
import { RowActions } from "@/components/ui/row-actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  useBranches,
  setBranchActiveAnywhere,
  deleteBranchAnywhere,
  restoreBranchAnywhere,
  resetBranchesToSeed,
  BRANCH_BACKEND,
  getDeletedBranches,
} from "@/features/tenancy/branch-store";
import { canManageBranches } from "@/features/tenancy/permissions";

export default function SucursalesPage() {
  const branches = useBranches();
  const toast = useToast();
  const canManage = canManageBranches();
  const isLocalBackend = BRANCH_BACKEND === "local";
  const [confirmReset, setConfirmReset] = React.useState(false);
  const [showDeleted, setShowDeleted] = React.useState(false);

  // Deleted branches (local mode only; in supabase mode these are not surfaced)
  const deletedBranches = showDeleted ? getDeletedBranches() : [];

  return (
    <>
      <PageHeader
        title="Sucursales"
        description="Sedes físicas del negocio. Cada sucursal puede tener su caja, inventario y configuración fiscal."
        breadcrumbs={[{ label: "Administración" }, { label: "Sucursales" }]}
        actions={
          <>
            {isLocalBackend && canManage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmReset(true)}
                aria-label="Restablecer en este equipo"
                title="Descartar cambios locales y volver al baseline"
              >
                <RefreshCw className="h-4 w-4" />
                Restablecer (este equipo)
              </Button>
            )}
            {isLocalBackend && (
              <Button
                variant={showDeleted ? "primary" : "outline"}
                size="sm"
                onClick={() => setShowDeleted((v) => !v)}
                aria-pressed={showDeleted}
                title="Mostrar sucursales eliminadas"
              >
                <Trash2 className="h-4 w-4" />
                {showDeleted ? "Ocultar eliminadas" : "Mostrar eliminadas"}
              </Button>
            )}
            {canManage && (
              <Link href="/admin/sucursales/nueva">
                <Button size="sm">
                  <Plus className="h-4 w-4" />
                  Nueva sucursal
                </Button>
              </Link>
            )}
          </>
        }
      />

      {isLocalBackend ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          Los cambios de sucursales se guardan <strong>en este equipo</strong>
          (modo demo, sin Supabase). Si otra PC muestra sucursales distintas, usa{" "}
          <strong>“Restablecer (este equipo)”</strong> para volver al baseline
          compartido. Los selectores de operación sólo muestran sucursales activas.
        </div>
      ) : (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-900">
          Las sucursales son una <strong>fuente única compartida</strong> (Supabase).
          Los cambios se ven en todos los equipos. Los selectores de operación sólo
          muestran sucursales activas.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {branches.map((b) => {
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
                      onDelete={async () => {
                        const res = await deleteBranchAnywhere(b.id);
                        if (!res.ok) toast.error(res.error);
                        else toast.success("Sucursal eliminada.");
                      }}
                      entityName={b.name}
                      customActions={[
                        b.status === "active"
                          ? {
                              label: "Inactivar",
                              icon: Power,
                              onClick: async () => {
                                const res = await setBranchActiveAnywhere(b.id, false);
                                if (!res.ok) toast.error(res.error);
                                else toast.success(`${b.name} inactivada.`);
                              },
                              confirm: {
                                title: "Inactivar sucursal",
                                message: `¿Seguro que deseas inactivar ${b.name}? No se borra inventario, movimientos ni ventas.`,
                              },
                            }
                          : {
                              label: "Reactivar",
                              icon: RotateCcw,
                              onClick: async () => {
                                const res = await setBranchActiveAnywhere(b.id, true);
                                if (!res.ok) toast.error(res.error);
                                else toast.success(`${b.name} reactivada.`);
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

        {/* Eliminadas (solo visibles cuando el toggle "Mostrar eliminadas" está activo) */}
        {deletedBranches.map((b) => (
          <Card key={b.id} className="overflow-hidden opacity-60">
            <div className="flex items-start justify-between gap-3 p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-400">
                  <Building2 className="h-5 w-5" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold line-through">{b.name}</h3>
                  </div>
                  <p className="text-xs opacity-60">{b.code}</p>
                </div>
              </div>
              <Badge tone="danger">Eliminada</Badge>
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
            </dl>

            {canManage && (
              <div className="flex items-center justify-end border-t border-black/5 bg-black/[0.015] px-5 py-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const res = await restoreBranchAnywhere(b.id);
                    if (!res.ok) toast.error(res.error);
                    else toast.success(`${b.name} restaurada como inactiva.`);
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Restaurar
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Restablecer sucursales en este equipo"
        destructive={false}
        confirmLabel="Restablecer"
        message="Se descartan los cambios de sucursales hechos en este equipo (altas, ediciones y bajas locales) y la sucursal seleccionada, volviendo al baseline compartido. No afecta inventario, ventas ni otros datos."
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          resetBranchesToSeed();
          setConfirmReset(false);
          toast.success("Sucursales restablecidas en este equipo.");
        }}
      />
      <toast.Toast />
    </>
  );
}
