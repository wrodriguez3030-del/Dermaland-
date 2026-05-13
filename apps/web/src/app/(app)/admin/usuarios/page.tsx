"use client";

import { Plus, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Button,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { SearchInput } from "@/components/ui/search-input";
import { FilterBar } from "@/components/ui/filter-bar";
import { RowActions } from "@/components/ui/row-actions";
import { useLocalSoftDelete } from "@/components/ui/use-local-soft-delete";
import { useToast } from "@/components/ui/toast";
import {
  mockUsers,
  roleBadgeTone,
  roleDefinitions,
} from "@/lib/mock-data/users";
import { mockBranches } from "@/lib/mock-data/tenancy";
import { relativeTime } from "@/lib/utils/format";

export default function UsuariosPage() {
  const { visible, hide } = useLocalSoftDelete(mockUsers);
  const toast = useToast();
  const branchById = Object.fromEntries(mockBranches.map((b) => [b.id, b]));
  const roleLabel = Object.fromEntries(
    roleDefinitions.map((r) => [r.key, r.label]),
  );

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Operadores del negocio: admin, gerentes, cajeros, inventario, supervisores, auditores."
        breadcrumbs={[{ label: "Administración" }, { label: "Usuarios" }]}
        actions={
          <Button size="sm">
            <Plus className="h-4 w-4" />
            Invitar usuario
          </Button>
        }
      />

      <FilterBar className="mb-4">
        <SearchInput
          placeholder="Buscar por nombre o email…"
          containerClassName="flex-1 min-w-[240px]"
        />
        <select className="h-10 rounded-lg border border-black/15 bg-white px-3 text-sm">
          <option>Todos los roles</option>
          {roleDefinitions.map((r) => (
            <option key={r.key}>{r.label}</option>
          ))}
        </select>
        <select className="h-10 rounded-lg border border-black/15 bg-white px-3 text-sm">
          <option>Todas las sucursales</option>
          {mockBranches.map((b) => (
            <option key={b.id}>{b.name}</option>
          ))}
        </select>
        <select className="h-10 rounded-lg border border-black/15 bg-white px-3 text-sm">
          <option>Estado: todos</option>
          <option>Activos</option>
          <option>Invitados</option>
          <option>Deshabilitados</option>
        </select>
      </FilterBar>

      <Table>
        <THead>
          <TR>
            <TH>Usuario</TH>
            <TH>Rol</TH>
            <TH>Sucursales</TH>
            <TH>2FA</TH>
            <TH>Estado</TH>
            <TH>Último acceso</TH>
            <TH className="text-right pr-4">Acciones</TH>
          </TR>
        </THead>
        <TBody>
          {visible.map((u) => (
            <TR key={u.id}>
              <TD>
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{ background: u.avatarColor }}
                  >
                    {u.fullName
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                  <div>
                    <div className="font-medium">{u.fullName}</div>
                    <div className="text-xs opacity-60">{u.email}</div>
                  </div>
                </div>
              </TD>
              <TD>
                <Badge tone={roleBadgeTone(u.role)}>
                  {roleLabel[u.role] ?? u.role}
                </Badge>
              </TD>
              <TD>
                <div className="text-xs opacity-80">
                  {u.branchIds
                    .map((id) => branchById[id]?.code ?? id)
                    .join(", ")}
                </div>
              </TD>
              <TD>
                {u.twoFactorEnabled ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                    <ShieldCheck className="h-3.5 w-3.5" /> TOTP
                  </span>
                ) : (
                  <span className="text-xs opacity-50">Sin 2FA</span>
                )}
              </TD>
              <TD>
                <Badge
                  tone={
                    u.status === "active"
                      ? "success"
                      : u.status === "invited"
                        ? "info"
                        : "neutral"
                  }
                >
                  {u.status === "active"
                    ? "Activo"
                    : u.status === "invited"
                      ? "Invitado"
                      : "Deshabilitado"}
                </Badge>
              </TD>
              <TD className="text-xs opacity-70">
                {u.lastLoginAt ? relativeTime(u.lastLoginAt) : "—"}
              </TD>
              <TD className="pr-4">
                <RowActions
                  viewHref={`/admin/usuarios/${u.id}`}
                  editHref={`/admin/usuarios/${u.id}/editar`}
                  onDelete={() => {
                    hide(u.id);
                    toast.success("Usuario eliminado correctamente.");
                  }}
                  deleteLabel="Eliminar"
                  entityName={u.fullName}
                />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <toast.Toast />
    </>
  );
}
