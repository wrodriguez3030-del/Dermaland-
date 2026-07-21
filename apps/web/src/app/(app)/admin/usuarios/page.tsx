"use client";

import * as React from "react";
import { Plus, ShieldCheck, Pencil, Power } from "lucide-react";
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
import { RowActions } from "@/components/ui/row-actions";
import { useToast } from "@/components/ui/toast";
import {
  roleBadgeTone,
  roleDefinitions,
  mockCurrentUser,
} from "@/lib/mock-data/users";
import {
  useBranchesState,
  getBranchDisplayName,
} from "@/features/tenancy/branch-store";
import { relativeTime } from "@/lib/utils/format";
import {
  useUsersList,
  setUserStatus,
  USER_BACKEND,
} from "@/features/admin/user-store";
import { UserModal } from "@/features/admin/components/user-modal";
import { canManageIncentiveRules } from "@/features/billing/permissions";
import type { User } from "@/types";

export default function UsuariosPage() {
  const { users, loading, error, refresh } = useUsersList();
  const toast = useToast();
  // Sucursales REALES (Supabase en prod). Puebla el cache de nombres para que
  // `getBranchDisplayName` nunca exponga el UUID técnico del branch_id.
  const { list: branches } = useBranchesState();
  const branchById = React.useMemo(
    () => Object.fromEntries(branches.map((b) => [b.id, b])),
    [branches],
  );
  const roleLabel = Object.fromEntries(
    roleDefinitions.map((r) => [r.key, r.label]),
  );
  const canManage = canManageIncentiveRules(mockCurrentUser.role);
  const [modal, setModal] = React.useState<{ open: boolean; user?: User | null }>({
    open: false,
  });
  const visible = users;

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Personal del negocio: admin, gerentes, cajeros, vendedores, inventario, supervisores. Los vendedores aparecen en el POS y generan incentivos."
        breadcrumbs={[{ label: "Administración" }, { label: "Usuarios" }]}
        actions={
          canManage && (
            <Button size="sm" onClick={() => setModal({ open: true, user: null })}>
              <Plus className="h-4 w-4" />
              Nuevo usuario
            </Button>
          )
        }
      />

      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
          {error}{" "}
          <button className="underline" onClick={refresh}>
            Reintentar
          </button>
        </div>
      )}
      {loading && (
        <div className="mb-4 rounded-lg border border-black/5 bg-black/[0.02] px-3 py-6 text-center text-sm opacity-60">
          Cargando usuarios…
        </div>
      )}

      {/* Móvil: tarjetas */}
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white md:hidden">
        {!loading && visible.length === 0 && (
          <div className="px-4 py-10 text-center text-sm opacity-60">Sin usuarios.</div>
        )}
        {visible.map((u) => (
          <button
            key={u.id}
            onClick={() => canManage && setModal({ open: true, user: u })}
            className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-black/[0.03]"
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{ background: u.avatarColor }}
            >
              {u.fullName
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{u.fullName}</div>
              <div className="truncate text-xs opacity-60">{u.email}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <Badge tone={roleBadgeTone(u.role)}>{roleLabel[u.role] ?? u.role}</Badge>
                <Badge
                  tone={u.status === "active" ? "success" : u.status === "invited" ? "info" : "neutral"}
                >
                  {u.status === "active" ? "Activo" : u.status === "invited" ? "Invitado" : "Deshabilitado"}
                </Badge>
                {u.twoFactorEnabled && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-700">
                    <ShieldCheck className="h-3 w-3" /> 2FA
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Desktop: tabla */}
      <div className="hidden md:block">
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
                  {u.branchIds.length
                    ? u.branchIds
                        .map(
                          (id) =>
                            branchById[id]?.name ?? getBranchDisplayName(id, "—"),
                        )
                        .join(", ")
                    : "—"}
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
                  onEdit={canManage ? () => setModal({ open: true, user: u }) : undefined}
                  entityName={u.fullName}
                  customActions={
                    canManage
                      ? [
                          {
                            label: u.status === "disabled" ? "Activar" : "Desactivar",
                            icon: u.status === "disabled" ? Power : Power,
                            onClick: async () => {
                              const res = await setUserStatus(
                                u.id,
                                u.status === "disabled" ? "active" : "disabled",
                              );
                              if (!res.ok) toast.error(res.error);
                              else
                                toast.success(
                                  u.status === "disabled"
                                    ? "Usuario activado."
                                    : "Usuario desactivado.",
                                );
                            },
                            ...(u.status === "disabled"
                              ? {}
                              : {
                                  confirm: {
                                    title: "Desactivar usuario",
                                    message: `${u.fullName} dejará de aparecer como vendedor y no podrá operar.`,
                                  },
                                }),
                          },
                        ]
                      : []
                  }
                />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      </div>

      <UserModal
        open={modal.open}
        user={modal.user}
        onClose={() => setModal({ open: false })}
      />
      <toast.Toast />
    </>
  );
}
