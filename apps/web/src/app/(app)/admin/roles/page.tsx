"use client";

import { ShieldCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
} from "@/components/ui";
import { RowActions } from "@/components/ui/row-actions";
import { useLocalSoftDelete } from "@/components/ui/use-local-soft-delete";
import { useToast } from "@/components/ui/toast";
import {
  mockUsers,
  permissionLabel,
  roleBadgeTone,
  roleDefinitions,
} from "@/lib/mock-data/users";

export default function RolesPage() {
  const items = roleDefinitions.map((r) => ({ ...r, id: r.key }));
  const { visible, hide } = useLocalSoftDelete(items);
  const toast = useToast();

  return (
    <>
      <PageHeader
        title="Roles"
        description="Roles base preconfigurados según el modelo de SPEC §5. Personalizables por business."
        breadcrumbs={[{ label: "Administración" }, { label: "Roles" }]}
        actions={<Button size="sm">Crear rol personalizado</Button>}
      />

      <div className="grid gap-4 md:grid-cols-2">
        {visible.map((role) => {
          const usersInRole = mockUsers.filter((u) => u.role === role.key);
          return (
            <Card key={role.key}>
              <CardHeader className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{role.label}</CardTitle>
                  <p className="mt-1 text-sm opacity-60">{role.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={roleBadgeTone(role.key)}>{role.key}</Badge>
                  <RowActions
                    viewHref={`/admin/roles/${role.key}`}
                    editHref={`/admin/roles/${role.key}/editar`}
                    onDelete={() => {
                      hide(role.id);
                      toast.success("Rol eliminado correctamente.");
                    }}
                    entityName={role.label}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex items-center gap-2 text-xs">
                  <Users className="h-3.5 w-3.5 opacity-60" />
                  <span className="opacity-70">
                    {usersInRole.length}{" "}
                    {usersInRole.length === 1 ? "usuario" : "usuarios"}
                  </span>
                </div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider opacity-50">
                  Permisos clave
                </div>
                <ul className="space-y-1">
                  {role.permissions.slice(0, 6).map((p) => (
                    <li key={p} className="flex items-start gap-2 text-xs">
                      <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-[color:var(--brand-primary)]" />
                      <span title={p}>{permissionLabel(p)}</span>
                    </li>
                  ))}
                  {role.permissions.length > 6 && (
                    <li className="text-xs opacity-50">
                      +{role.permissions.length - 6} más
                    </li>
                  )}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <toast.Toast />
    </>
  );
}
