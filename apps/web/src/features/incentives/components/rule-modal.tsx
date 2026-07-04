"use client";

import * as React from "react";
import { AlertTriangle, Gift } from "lucide-react";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import {
  saveIncentiveRule,
  RULE_TYPE_LABEL,
  type IncentiveRuleRecord,
} from "@/features/incentives/incentive-store";
import type { IncentiveRuleType } from "@/features/incentives/incentive-engine";
import { useLaboratoriesList } from "@/features/products/catalog-store";

interface Props {
  open: boolean;
  rule?: IncentiveRuleRecord | null;
  onClose: () => void;
}

const NEEDS_PERCENT: IncentiveRuleType[] = [
  "percent_on_sale",
  "percent_on_margin",
];
const NEEDS_LAB: IncentiveRuleType[] = ["per_laboratory"];
const NEEDS_PRODUCT: IncentiveRuleType[] = ["fixed_per_product"];

export function IncentiveRuleModal({ open, rule, onClose }: Props) {
  const toast = useToast();
  const labs = useLaboratoriesList();
  const [name, setName] = React.useState("");
  const [ruleType, setRuleType] = React.useState<IncentiveRuleType>("percent_on_sale");
  const [percentage, setPercentage] = React.useState("");
  const [fixedAmount, setFixedAmount] = React.useState("");
  const [minSalesAmount, setMinSalesAmount] = React.useState("");
  const [laboratoryId, setLaboratoryId] = React.useState("");
  const [startsAt, setStartsAt] = React.useState("");
  const [endsAt, setEndsAt] = React.useState("");
  const [active, setActive] = React.useState(true);
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(rule?.name ?? "");
    setRuleType((rule?.ruleType as IncentiveRuleType) ?? "percent_on_sale");
    setPercentage(rule?.percentage != null ? String(rule.percentage) : "");
    setFixedAmount(rule?.fixedAmount != null ? String(rule.fixedAmount) : "");
    setMinSalesAmount(rule?.minSalesAmount != null ? String(rule.minSalesAmount) : "");
    setLaboratoryId(rule?.laboratoryId ?? "");
    setStartsAt(rule?.startsAt ?? "");
    setEndsAt(rule?.endsAt ?? "");
    setActive(rule?.active ?? true);
    setNote(rule?.note ?? "");
    setError(null);
  }, [open, rule]);

  if (!open) return null;

  const submit = async () => {
    if (!name.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    if (NEEDS_PERCENT.includes(ruleType) && !percentage) {
      setError("Indica el porcentaje.");
      return;
    }
    if (NEEDS_PRODUCT.includes(ruleType)) {
      setError("El incentivo por producto se configura desde el producto (próximamente). Usa por laboratorio/categoría o % por ahora.");
      return;
    }
    setSaving(true);
    const res = await saveIncentiveRule(
      {
        name: name.trim(),
        ruleType,
        percentage: percentage ? Number(percentage) : null,
        fixedAmount: fixedAmount ? Number(fixedAmount) : null,
        minSalesAmount: minSalesAmount ? Number(minSalesAmount) : null,
        laboratoryId: NEEDS_LAB.includes(ruleType) ? laboratoryId || null : null,
        startsAt: startsAt || null,
        endsAt: endsAt || null,
        active,
        note: note || null,
      },
      rule?.id,
    );
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast.success(rule ? "Regla actualizada." : "Regla creada.");
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
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--brand-primary)]/15 text-[color:var(--brand-accent)]">
            <Gift className="h-5 w-5" />
          </span>
          <h2 className="text-base font-semibold">
            {rule ? "Editar regla de incentivo" : "Nueva regla de incentivo"}
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
            <Label>Nombre *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. 5% sobre venta neta" />
          </div>
          <div className="sm:col-span-2">
            <Label>Tipo de incentivo *</Label>
            <Select
              value={ruleType}
              onChange={(e) => setRuleType(e.target.value as IncentiveRuleType)}
            >
              {(Object.keys(RULE_TYPE_LABEL) as IncentiveRuleType[]).map((t) => (
                <option key={t} value={t}>
                  {RULE_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </div>

          {NEEDS_PERCENT.includes(ruleType) && (
            <div>
              <Label>Porcentaje (%) *</Label>
              <Input
                type="number"
                value={percentage}
                onChange={(e) => setPercentage(e.target.value)}
                placeholder="5"
              />
            </div>
          )}
          {(ruleType === "per_laboratory" ||
            ruleType === "per_category" ||
            ruleType === "per_goal") && (
            <div>
              <Label>Porcentaje (%) o deja vacío para monto fijo</Label>
              <Input
                type="number"
                value={percentage}
                onChange={(e) => setPercentage(e.target.value)}
                placeholder="8"
              />
            </div>
          )}
          {(ruleType === "per_laboratory" ||
            ruleType === "per_category" ||
            ruleType === "per_goal") && (
            <div>
              <Label>Monto fijo (RD$)</Label>
              <Input
                type="number"
                value={fixedAmount}
                onChange={(e) => setFixedAmount(e.target.value)}
                placeholder="30"
              />
            </div>
          )}

          {NEEDS_LAB.includes(ruleType) && (
            <div className="sm:col-span-2">
              <Label>Laboratorio *</Label>
              <Select
                value={laboratoryId}
                onChange={(e) => setLaboratoryId(e.target.value)}
              >
                <option value="">Selecciona un laboratorio…</option>
                {labs.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {(ruleType === "percent_on_sale" || ruleType === "per_goal") && (
            <div>
              <Label>Venta mínima (RD$)</Label>
              <Input
                type="number"
                value={minSalesAmount}
                onChange={(e) => setMinSalesAmount(e.target.value)}
                placeholder={ruleType === "per_goal" ? "Meta del período" : "Umbral por venta"}
              />
            </div>
          )}

          <div>
            <Label>Vigente desde</Label>
            <Input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </div>
          <div>
            <Label>Vigente hasta</Label>
            <Input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              Activa
            </label>
          </div>
          <div className="sm:col-span-2">
            <Label>Nota interna</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-black/5 bg-black/[0.02] p-3 text-xs opacity-80">
          La base del incentivo es la <strong>venta neta sin ITBIS</strong>{" "}
          (después de descuentos). El margen usa el costo del producto. El
          incentivo se calcula al pagar la venta y se guarda como snapshot: una
          regla que cambie luego NO altera incentivos ya generados.
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" onClick={submit} disabled={saving}>
            {saving ? "Guardando…" : rule ? "Guardar cambios" : "Crear regla"}
          </Button>
        </div>
      </div>
    </div>
  );
}
