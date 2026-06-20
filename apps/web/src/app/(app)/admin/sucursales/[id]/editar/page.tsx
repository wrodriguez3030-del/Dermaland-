"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui";
import { BranchForm } from "@/features/tenancy/branch-form";
import { useBranch } from "@/features/tenancy/branch-store";
import { canManageBranches } from "@/features/tenancy/permissions";

export default function EditarSucursalPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const branch = useBranch(id);

  if (!canManageBranches()) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm opacity-70">
          No tienes permiso para editar sucursales.
        </CardContent>
      </Card>
    );
  }

  if (!branch) {
    return (
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
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link
        href={`/admin/sucursales/${id}`}
        className="mb-4 inline-flex items-center gap-1 text-xs opacity-60 hover:opacity-100"
      >
        <ArrowLeft className="h-3 w-3" /> Volver a la sucursal
      </Link>
      <PageHeader
        title={`Editar ${branch.name}`}
        description={branch.code}
        breadcrumbs={[
          { label: "Administración" },
          { label: "Sucursales", href: "/admin/sucursales" },
          { label: branch.code, href: `/admin/sucursales/${id}` },
          { label: "Editar" },
        ]}
      />
      <BranchForm mode="edit" branch={branch} />
    </div>
  );
}
