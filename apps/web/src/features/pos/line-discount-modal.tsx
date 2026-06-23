"use client";

import * as React from "react";
import { Button, Input, Label, Select } from "@/components/ui";
import { Modal } from "@/components/ui/modal";
import { formatCurrency } from "@/lib/utils/format";
import {
  lineAmounts,
  validateLineDiscount,
  type LineDiscountType,
} from "./cart-line";

export interface LineDiscountModalProps {
  open: boolean;
  productName: string;
  unitPrice: number;
  itbisRate: number;
  quantity: number;
  initialType: LineDiscountType;
  initialValue: number;
  initialReason?: string;
  onClose: () => void;
  onApply: (type: LineDiscountType, value: number, reason: string) => void;
}

/**
 * Mini-modal de descuento por producto: porcentaje, monto RD$ o sin descuento.
 * Valida (no negativo, % ≤ 100, monto ≤ subtotal, producto con precio) y muestra
 * una vista previa del total con descuento.
 */
export function LineDiscountModal({
  open,
  productName,
  unitPrice,
  itbisRate,
  quantity,
  initialType,
  initialValue,
  initialReason,
  onClose,
  onApply,
}: LineDiscountModalProps) {
  const [type, setType] = React.useState<LineDiscountType>(initialType);
  const [value, setValue] = React.useState(String(initialValue || ""));
  const [reason, setReason] = React.useState(initialReason ?? "");
  const [error, setError] = React.useState<string | null>(null);

  // Reinicia al abrir.
  React.useEffect(() => {
    if (open) {
      setType(initialType);
      setValue(initialValue ? String(initialValue) : "");
      setReason(initialReason ?? "");
      setError(null);
    }
  }, [open, initialType, initialValue, initialReason]);

  if (!open) return null;

  const numValue = Number(value.replace(",", ".")) || 0;
  const preview = lineAmounts({
    unitPrice,
    itbisRate,
    quantity,
    discountType: type,
    discountValue: numValue,
  });

  const submit = () => {
    if (type === "none") {
      onApply("none", 0, "");
      onClose();
      return;
    }
    const v = validateLineDiscount(type, numValue, unitPrice, quantity);
    if (!v.ok) {
      setError(v.error ?? "Descuento inválido.");
      return;
    }
    onApply(type, numValue, reason.trim());
    onClose();
  };

  return (
    <Modal
      open={open}
      title="Descuento del producto"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" size="sm" onClick={submit}>
            Aplicar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs opacity-60">{productName}</p>
        <div>
          <Label htmlFor="disc-type">Tipo</Label>
          <Select
            id="disc-type"
            value={type}
            onChange={(e) => {
              setType(e.target.value as LineDiscountType);
              setError(null);
            }}
          >
            <option value="none">Sin descuento</option>
            <option value="percent">Porcentaje (%)</option>
            <option value="amount">Monto (RD$)</option>
          </Select>
        </div>
        {type !== "none" && (
          <>
            <div>
              <Label htmlFor="disc-value">
                {type === "percent" ? "Porcentaje (%)" : "Monto (RD$)"}
              </Label>
              <Input
                id="disc-value"
                type="number"
                min={0}
                step={type === "percent" ? 1 : 0.01}
                value={value}
                autoFocus
                onChange={(e) => {
                  setValue(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
            </div>
            <div>
              <Label htmlFor="disc-reason">Motivo (opcional)</Label>
              <Input
                id="disc-reason"
                value={reason}
                placeholder="Ej. Cliente frecuente"
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <div className="rounded-lg bg-black/[0.03] px-3 py-2 text-xs">
              <div className="flex justify-between">
                <span className="opacity-60">Descuento</span>
                <span className="tabular-nums">
                  -{formatCurrency(preview.discountInclusive)}
                </span>
              </div>
              <div className="mt-0.5 flex justify-between font-semibold">
                <span>Total de la línea</span>
                <span className="tabular-nums">{formatCurrency(preview.total)}</span>
              </div>
            </div>
          </>
        )}
        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
