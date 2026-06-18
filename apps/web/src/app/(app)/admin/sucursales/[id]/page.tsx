"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  Power,
  RotateCcw,
  Boxes,
  Building2,
  Star,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, Button, Card, CardContent } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { mockWarehouses } from "@/lib/mock-data/tenancy";
import { mockUsers } from "@/lib/mock-data/users";
import { listAllLots, useInventoryTick } from "@/features/inventory/lot-store";
import {
  useBranch,
  branchDependencies,
  setBranchActiveAnywhere,
  deleteBranchAnywhere,
} from "@/features/tenancy/branch-store";
import { canManageBranches } from "@/features/tenancy/permissions";

export default function SucursalDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const toast = useToast();
  const branch = useBranch(id);
  useInventoryTick();
  const canManage = canManageBranches();

  const [confirmInactivate, setConfirmInactivate] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  if (!branch) {
    return (
      <>
        <PageHeader
          title="Sucursal no encontrada"
          breadcrumbs={[
            { label: "Administración" },
            { label: "Sucursales", href: "/admin/sucursales" },
            { label: id },
          ]}
        />
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm opacity-70">
              No encontramos la sucursal <code>{id}</code>.
            </p>
            <Link
              href="/admin/sucursales"
              className="mt-4 inline-block text-sm text-[color:var(--brand-accent)] hover:underline"
            >
              ← Volver a sucursales
            </Link>
          </CardContent>
        </Card>
      </>
    );
  }

  const warehouses = mockWarehouses.filter((w) => w.branchId === branch.id);
  const branchLots = listAllLots().filter((l) => l.branchId === branch.id);
  const users = mockUsers.filter((u) => u.branchIds?.includes(branch.id));
  const deps = branchDependencies(branch.id);

  return (
    <>
      <Link
        href="/admin/sucursales"
        className="mb-4 inline-flex items-center gap-1 text-xs opacity-60 hover:opacity-100"
      >
        <ArrowLeft className="h-3 w-3" /> Volver a sucursales
      </Link>

      <PageHeader
        title={branch.name}
        description={branch.code}
        breadcrumbs={[
          { label: "Administración" },
          { label: "Sucursales", href: "/admin/sucursales" },
          { label: branch.code },
        ]}
        actions={
          <>
            <Link href={`/inventario?branch=${branch.id}`}>
              <Button variant="outline" size="sm">
                <Boxes className="h-4 w-4" /> Ver inventario
              </Button>
            </Link>
            {canManage && (
              <Link href={`/admin/sucursales/${branch.id}/editar`}>
                <Button size="sm">
                  <Pencil className="h-4 w-4" /> Editar
                </Button>
              </Link>
            )}
          </>
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--brand-primary)]/10 text-[color:var(--brand-accent)]">
                <Building2 className="h-5 w-5" />
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={branch.status === "active" ? "success" : "neutral"}>
                  {branch.status === "active" ? "Activa" : "Inactiva"}
                </Badge>
                {branch.isPilot && (
                  <Badge tone="primary" outlined>
                    <Star className="h-3 w-3" /> Piloto
                  </Badge>
                )}
                <Badge tone={branch.showOnWebsite ? "info" : "neutral"}>
                  {branch.showOnWebsite ? "Visible en web" : "Oculta en web"}
                </Badge>
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Field label="Dirección">
                {branch.address || "—"}
                {branch.city ? `, ${branch.city}` : ""}
              </Field>
              <Field label="Provincia">{branch.province || "—"}</Field>
              <Field label="Teléfono">{branch.phone ?? "—"}</Field>
              <Field label="Email">{branch.email ?? "—"}</Field>
              <Field label="País">{branch.country}</Field>
              <Field label="Código">{branch.code}</Field>
            </dl>
          </CardContent>
        </Card>

        {/* Acciones rápidas */}
        {canManage && (
          <Card>
            <CardContent className="space-y-2">
              <div className="text-sm font-semibold">Acciones rápidas</div>
              <Link href={`/admin/sucursales/${branch.id}/editar`}>
                <Button variant="outline" size="sm" className="w-full justify-start">
                  <Pencil className="h-4 w-4" /> Editar sucursal
                </Button>
              </Link>
              {branch.status === "active" ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => setConfirmInactivate(true)}
                >
                  <Power className="h-4 w-4" /> Inactivar
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={async () => {
                    const res = await setBranchActiveAnywhere(branch.id, true);
                    if (!res.ok) toast.error(res.error);
                    else toast.success("Sucursal reactivada.");
                  }}
                >
                  <RotateCcw className="h-4 w-4" /> Reactivar
                </Button>
              )}
              <Link href={`/inventario?branch=${branch.id}`}>
                <Button variant="outline" size="sm" className="w-full justify-start">
                  <Boxes className="h-4 w-4" /> Ver inventario
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-rose-600 hover:bg-rose-50"
                onClick={() => setConfirmDelete(true)}
              >
                Eliminar sucursal
              </Button>
              {deps.total > 0 && (
                <p className="text-[11px] opacity-60">
                  Tiene {deps.total} dato(s) asociado(s): no se puede eliminar,
                  sólo inactivar.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Almacenes */}
      <Card className="mb-6">
        <CardContent>
          <div className="mb-3 text-sm font-semibold">
            Almacenes ({warehouses.length})
          </div>
          {warehouses.length === 0 ? (
            <p className="text-sm opacity-60">Sin almacenes asociados.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {warehouses.map((w) => (
                <li
                  key={w.id}
                  className="flex items-center justify-between rounded-lg border border-black/10 px-3 py-2"
                >
                  <span>
                    {w.name} <span className="opacity-50">· {w.code}</span>
                    {w.isMain && (
                      <Badge tone="primary" className="ml-2">
                        Principal
                      </Badge>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Inventario asociado */}
      <Card className="mb-6">
        <CardContent>
          <div className="mb-1 flex items-center justify-between">
            <div className="text-sm font-semibold">Inventario asociado</div>
            <Link
              href={`/inventario?branch=${branch.id}`}
              className="text-xs font-medium text-[color:var(--brand-accent)] hover:underline"
            >
              Ver inventario →
            </Link>
          </div>
          <p className="text-sm opacity-70">
            {branchLots.length} lote(s) en esta sucursal.
          </p>
        </CardContent>
      </Card>

      {/* Usuarios / cajeros */}
      {users.length > 0 && (
        <Card>
          <CardContent>
            <div className="mb-3 text-sm font-semibold">
              Usuarios asignados ({users.length})
            </div>
            <ul className="space-y-1 text-sm">
              {users.map((u) => (
                <li key={u.id} className="flex items-center justify-between">
                  <span>{u.fullName}</span>
                  <Badge tone="neutral">{u.role.replace("_", " ")}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirmInactivate}
        title="Inactivar sucursal"
        destructive={false}
        confirmLabel="Inactivar"
        message={`¿Seguro que deseas inactivar ${branch.name}? No se borra inventario, movimientos ni ventas.`}
        onCancel={() => setConfirmInactivate(false)}
        onConfirm={async () => {
          const res = await setBranchActiveAnywhere(branch.id, false);
          setConfirmInactivate(false);
          if (!res.ok) toast.error(res.error);
          else toast.success("Sucursal inactivada.");
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Eliminar sucursal"
        confirmLabel="Eliminar"
        message={`¿Eliminar ${branch.name}? Sólo es posible si no tiene datos asociados.`}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          const res = await deleteBranchAnywhere(branch.id);
          setConfirmDelete(false);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success("Sucursal eliminada.");
          setTimeout(() => router.push("/admin/sucursales"), 500);
        }}
      />
      <toast.Toast />
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider opacity-50">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
