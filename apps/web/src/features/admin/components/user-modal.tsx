"use client";

import * as React from "react";
import { AlertTriangle, UserPlus } from "lucide-react";
import { Button, Input, Label, Select } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { saveUser, USER_BACKEND } from "@/features/admin/user-store";
import { roleDefinitions } from "@/lib/mock-data/users";
import { useActiveBranches } from "@/features/tenancy/branch-store";
import type { User, UserRole } from "@/types";

interface Props {
  open: boolean;
  user?: User | null;
  onClose: () => void;
}

// Roles asignables desde la app (super_admin es interno de plataforma).
const ASSIGNABLE = roleDefinitions.filter((r) => r.key !== "super_admin");

export function UserModal({ open, user, onClose }: Props) {
  const toast = useToast();
  const branches = useActiveBranches();
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [role, setRole] = React.useState<UserRole>("vendedor");
  const [branchIds, setBranchIds] = React.useState<string[]>([]);
  const [status, setStatus] = React.useState<"active" | "disabled">("active");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setFullName(user?.fullName ?? "");
    setEmail(user?.email ?? "");
    setPhone(user?.phone ?? "");
    setRole((user?.role as UserRole) ?? "vendedor");
    setBranchIds(user?.branchIds ?? []);
    setStatus(user?.status === "disabled" ? "disabled" : "active");
    setError(null);
  }, [open, user]);

  if (!open) return null;

  const toggleBranch = (id: string) =>
    setBranchIds((b) => (b.includes(id) ? b.filter((x) => x !== id) : [...b, id]));

  const submit = async () => {
    if (!fullName.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    if (!email.trim()) {
      setError("El email es obligatorio.");
      return;
    }
    setSaving(true);
    const res = await saveUser(
      { fullName: fullName.trim(), email: email.trim(), phone: phone.trim() || undefined, role, branchIds, status },
      user?.id,
    );
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast.success(user ? "Usuario actualizado." : "Usuario registrado.");
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--brand-primary)]/15 text-[color:var(--brand-accent)]">
            <UserPlus className="h-5 w-5" />
          </span>
          <h2 className="text-base font-semibold">
            {user ? "Editar usuario" : "Nuevo usuario / vendedor"}
          </h2>
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Nombre completo *</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ej. Rosa Peralta" />
          </div>
          <div>
            <Label>Email *</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="rosa@dermaland.do"
              disabled={!!user}
            />
          </div>
          <div>
            <Label>Teléfono</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="809-000-0000" />
          </div>
          <div>
            <Label>Rol *</Label>
            <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              {ASSIGNABLE.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Estado</Label>
            <Select value={status} onChange={(e) => setStatus(e.target.value as "active" | "disabled")}>
              <option value="active">Activo</option>
              <option value="disabled">Deshabilitado</option>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Sucursales</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {branches.map((b) => (
                <label
                  key={b.id}
                  className="flex items-center gap-1.5 rounded-lg border border-black/10 px-2.5 py-1 text-xs"
                >
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5"
                    checked={branchIds.includes(b.id)}
                    onChange={() => toggleBranch(b.id)}
                  />
                  {b.name}
                </label>
              ))}
            </div>
            <p className="mt-1 text-[11px] opacity-60">
              Sin sucursales seleccionadas = acceso a todas (global).
            </p>
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-black/5 bg-black/[0.02] p-3 text-xs opacity-80">
          Registrar aquí a la persona la habilita como <strong>vendedor</strong>{" "}
          en el POS y para incentivos. El <strong>acceso al sistema (login con
          contraseña)</strong> se gestiona por separado — este registro no crea
          una cuenta de inicio de sesión.
        </div>

        {USER_BACKEND !== "supabase" && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Modo demo local: los usuarios no se guardan. Con Supabase activo se
            persisten y aparecen en el selector de vendedor del POS.
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" onClick={submit} disabled={saving}>
            {saving ? "Guardando…" : user ? "Guardar cambios" : "Registrar usuario"}
          </Button>
        </div>
      </div>
    </div>
  );
}
