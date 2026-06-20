"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui";
import { BranchForm } from "@/features/tenancy/branch-form";
import { canManageBranches } from "@/features/tenancy/permissions";

export default function NuevaSucursalPage() {
  if (!canManageBranches()) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm opacity-70">
          No tienes permiso para crear sucursales.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link
        href="/admin/sucursales"
        className="mb-4 inline-flex items-center gap-1 text-xs opacity-60 hover:opacity-100"
      >
        <ArrowLeft className="h-3 w-3" /> Volver a sucursales
      </Link>
      <PageHeader
        title="Nueva sucursal"
        breadcrumbs={[
          { label: "Administración" },
          { label: "Sucursales", href: "/admin/sucursales" },
          { label: "Nueva" },
        ]}
      />
      <BranchForm mode="create" />
    </div>
  );
}
