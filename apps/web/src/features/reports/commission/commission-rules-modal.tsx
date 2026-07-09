"use client";

import * as React from "react";
import { Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Badge, Button, Input, Label, Select } from "@/components/ui";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { PAYMENT_GROUP_LABEL, type PaymentGroup } from "@/features/sales/sales-report";
import type { CommissionRule } from "./commission-rules";
import {
  deleteCommissionRule,
  resetCommissionRules,
  saveCommissionRule,
  toggleCommissionRule,
  useCommissionRules,
} from "./commission-rules-store";

const GROUP_ORDER: PaymentGroup[] = ["cash", "transfer", "card", "other"];

interface FormState {
  id?: string;
  name: string;
  percentage: string;
  groups: Record<PaymentGroup, boolean>;
  branchId: string;
  priority: string;
  active: boolean;
  startsAt: string;
  endsAt: string;
}

const emptyForm = (): FormState => ({
  name: "",
  percentage: "",
  groups: { cash: false, card: false, transfer: false, other: false },
  branchId: "",
  priority: "10",
  active: true,
  startsAt: "",
  endsAt: "",
});

function ruleToForm(r: CommissionRule): FormState {
  const groups = { cash: false, card: false, transfer: false, other: false } as Record<PaymentGroup, boolean>;
  for (const g of r.paymentGroups ?? []) groups[g] = true;
  return {
    id: r.id,
    name: r.name,
    percentage: String(r.percentage),
    groups,
    branchId: r.branchId ?? "",
    priority: String(r.priority),
    active: r.active,
    startsAt: r.startsAt ?? "",
    endsAt: r.endsAt ?? "",
  };
}

function methodsLabel(r: CommissionRule): string {
  if (!r.paymentGroups || !r.paymentGroups.length) return "Cualquier método";
  return r.paymentGroups.map((g) => PAYMENT_GROUP_LABEL[g]).join(", ");
}

export function CommissionRulesModal({
  open,
  onClose,
  branches,
  canManage,
}: {
  open: boolean;
  onClose: () => void;
  branches: { id: string; name: string }[];
  canManage: boolean;
}) {
  const toast = useToast();
  const rules = useCommissionRules();
  const [form, setForm] = React.useState<FormState | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const branchName = React.useMemo(
    () => new Map(branches.map((b) => [b.id, b.name])),
    [branches],
  );

  const startCreate = () => {
    setError(null);
    setForm(emptyForm());
  };
  const startEdit = (r: CommissionRule) => {
    setError(null);
    setForm(ruleToForm(r));
  };
  const backToList = () => {
    setForm(null);
    setError(null);
  };

  const submit = async () => {
    if (!form) return;
    const groups = GROUP_ORDER.filter((g) => form.groups[g]);
    const res = await saveCommissionRule(
      form.id ? "edit" : "create",
      {
        name: form.name,
        percentage: Number(form.percentage),
        paymentGroups: groups.length ? groups : undefined,
        branchId: form.branchId || undefined,
        priority: Number(form.priority),
        active: form.active,
        startsAt: form.startsAt || undefined,
        endsAt: form.endsAt || undefined,
      },
      form.id,
    );
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast.success(form.id ? "Regla actualizada." : "Regla agregada.");
    backToList();
  };

  const remove = async (r: CommissionRule) => {
    const res = await deleteCommissionRule(r.id);
    if (!res.ok) {
      toast.error(res.error ?? "No se pudo eliminar la regla.");
      return;
    }
    toast.success("Regla eliminada.");
  };
  const toggle = async (r: CommissionRule) => {
    const res = await toggleCommissionRule(r.id);
    if (!res.ok) toast.error(res.error ?? "No se pudo cambiar el estado.");
  };
  const reset = async () => {
    const res = await resetCommissionRules();
    if (!res.ok) {
      toast.error(res.error ?? "No se pudo restablecer las reglas.");
      return;
    }
    toast.success("Reglas restablecidas a las de referencia.");
  };

  const setG = (g: PaymentGroup, v: boolean) =>
    setForm((f) => (f ? { ...f, groups: { ...f.groups, [g]: v } } : f));

  return (
    <Modal
      open={open}
      title={form ? (form.id ? "Editar regla de comisión" : "Agregar regla de comisión") : "Reglas de comisión"}
      onClose={() => {
        backToList();
        onClose();
      }}
      footer={
        form ? (
          <>
            <Button type="button" variant="outline" onClick={backToList}>
              Cancelar
            </Button>
            <Button type="button" onClick={submit} disabled={!canManage}>
              {form.id ? "Guardar cambios" : "Agregar regla"}
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={reset}
              disabled={!canManage}
              title="Restablecer las reglas del Excel de referencia"
            >
              <RotateCcw className="h-4 w-4" /> Restablecer
            </Button>
            <Button type="button" onClick={startCreate} disabled={!canManage}>
              <Plus className="h-4 w-4" /> Agregar regla
            </Button>
          </>
        )
      }
    >
      {!canManage && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Solo un administrador puede modificar las reglas de comisión.
        </div>
      )}

      {form ? (
        <div className="space-y-3 text-sm">
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
              {error}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Nombre <span className="text-rose-600">*</span></Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => (f ? { ...f, name: e.target.value } : f))}
                placeholder="Efectivo y transferencia 3%"
              />
            </div>
            <div>
              <Label>Porcentaje (%) <span className="text-rose-600">*</span></Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={form.percentage}
                onChange={(e) => setForm((f) => (f ? { ...f, percentage: e.target.value } : f))}
                placeholder="3"
              />
            </div>
          </div>

          <div>
            <Label>Métodos de pago a los que aplica</Label>
            <div className="flex flex-wrap gap-3">
              {GROUP_ORDER.map((g) => (
                <label key={g} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={form.groups[g]}
                    onChange={(e) => setG(g, e.target.checked)}
                  />
                  {PAYMENT_GROUP_LABEL[g]}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs opacity-60">
              Sin selección = aplica a cualquier método.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Sucursal (opcional)</Label>
              <Select
                value={form.branchId}
                onChange={(e) => setForm((f) => (f ? { ...f, branchId: e.target.value } : f))}
              >
                <option value="">Todas las sucursales</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Prioridad</Label>
              <Input
                type="number"
                value={form.priority}
                onChange={(e) => setForm((f) => (f ? { ...f, priority: e.target.value } : f))}
                placeholder="10"
              />
            </div>
            <div>
              <Label>Vigente desde (opcional)</Label>
              <Input
                type="date"
                value={form.startsAt}
                onChange={(e) => setForm((f) => (f ? { ...f, startsAt: e.target.value } : f))}
              />
            </div>
            <div>
              <Label>Vigente hasta (opcional)</Label>
              <Input
                type="date"
                value={form.endsAt}
                onChange={(e) => setForm((f) => (f ? { ...f, endsAt: e.target.value } : f))}
              />
            </div>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={form.active}
              onChange={(e) => setForm((f) => (f ? { ...f, active: e.target.checked } : f))}
            />
            Regla activa
          </label>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs opacity-60">
            Mayor prioridad gana cuando varias reglas coinciden. Base de cálculo = subtotal −
            descuento (antes de ITBIS).
          </p>
          {rules.length === 0 && (
            <p className="py-6 text-center text-sm opacity-60">No hay reglas configuradas.</p>
          )}
          {rules.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 rounded-lg border border-black/5 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{r.name}</span>
                  <Badge tone={r.active ? "success" : "neutral"}>
                    {r.active ? "Activa" : "Inactiva"}
                  </Badge>
                </div>
                <div className="text-xs opacity-60">
                  {methodsLabel(r)}
                  {r.branchId ? ` · ${branchName.get(r.branchId) ?? "Sucursal"}` : " · Todas las sucursales"}
                  {` · prioridad ${r.priority}`}
                </div>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-[color:var(--brand-accent)]">
                {r.percentage}%
              </span>
              {canManage && (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={r.active ? "Desactivar" : "Activar"}
                    title={r.active ? "Desactivar" : "Activar"}
                    onClick={() => toggle(r)}
                    className="rounded p-1.5 text-xs hover:bg-black/5"
                  >
                    {r.active ? "Off" : "On"}
                  </button>
                  <button
                    type="button"
                    aria-label="Editar"
                    title="Editar"
                    onClick={() => startEdit(r)}
                    className="rounded p-1.5 hover:bg-black/5"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Eliminar"
                    title="Eliminar"
                    onClick={() => remove(r)}
                    className="rounded p-1.5 text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <toast.Toast />
    </Modal>
  );
}
