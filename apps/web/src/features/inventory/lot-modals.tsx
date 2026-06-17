"use client";

import * as React from "react";
import { AlertTriangle, PackagePlus, SlidersHorizontal } from "lucide-react";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { getBranchById } from "@/lib/mock-data/tenancy";
import { addLot, adjustStock } from "@/features/inventory/lot-store";
import {
  listActiveBranches,
  defaultWarehouseForBranch,
} from "@/features/tenancy/branch-store";
import type { ProductLot } from "@/types";

function Overlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
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
        {children}
      </div>
    </div>
  );
}

// ── Nuevo lote ───────────────────────────────────────────────────────────────

interface NewLotModalProps {
  open: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
  /** Si el producto exige fecha de vencimiento. */
  requireExpiry?: boolean;
  onCreated?: () => void;
}

export function NewLotModal({
  open,
  onClose,
  productId,
  productName,
  requireExpiry = true,
  onCreated,
}: NewLotModalProps) {
  const toast = useToast();
  const [branchId, setBranchId] = React.useState("");
  const [lotNumber, setLotNumber] = React.useState("");
  const [quantity, setQuantity] = React.useState("");
  const [expiresAt, setExpiresAt] = React.useState("");
  const [unitCost, setUnitCost] = React.useState("");
  const [supplier, setSupplier] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [missing, setMissing] = React.useState<Set<string>>(new Set());
  const [error, setError] = React.useState<string | null>(null);

  const isMissing = (k: string) => missing.has(k);

  if (!open) return null;

  const reset = () => {
    setBranchId("");
    setLotNumber("");
    setQuantity("");
    setExpiresAt("");
    setUnitCost("");
    setSupplier("");
    setNotes("");
    setMissing(new Set());
    setError(null);
  };

  const submit = () => {
    setError(null);
    const r = addLot(
      {
        productId,
        branchId,
        warehouseId: branchId ? defaultWarehouseForBranch(branchId) : "",
        lotNumber,
        initialQuantity: Number(quantity),
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : "",
        unitCost: Number(unitCost) || 0,
        supplierId: supplier || undefined,
        notes: notes || undefined,
        reason: "Entrada inicial",
      },
      requireExpiry,
    );
    if (!r.ok) {
      setMissing(new Set(r.missingFields ?? []));
      setError(r.error);
      return;
    }
    toast.success(`Lote ${r.lot.lotNumber} agregado · ${r.lot.currentQuantity} u.`);
    reset();
    onCreated?.();
    onClose();
  };

  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--brand-primary)]/15 text-[color:var(--brand-accent)]">
          <PackagePlus className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold">Nuevo lote</h2>
          <p className="text-xs opacity-60">{productName}</p>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
        El stock se agrega por <strong>lote y sucursal</strong>. El producto
        existe globalmente, pero las existencias viven en cada sucursal.
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Sucursal *</Label>
          <Select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className={isMissing("branchId") ? "border-rose-400" : undefined}
          >
            <option value="">— Selecciona —</option>
            {listActiveBranches().map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Número de lote *</Label>
          <Input
            value={lotNumber}
            onChange={(e) => setLotNumber(e.target.value)}
            placeholder="LRP24A"
            className={isMissing("lotNumber") ? "border-rose-400" : undefined}
          />
        </div>
        <div>
          <Label>Cantidad inicial *</Label>
          <Input
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="24"
            className={isMissing("initialQuantity") ? "border-rose-400" : undefined}
          />
        </div>
        <div>
          <Label>Fecha de vencimiento {requireExpiry ? "*" : ""}</Label>
          <Input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className={isMissing("expiresAt") ? "border-rose-400" : undefined}
          />
        </div>
        <div>
          <Label>Costo del lote (unidad)</Label>
          <Input
            type="number"
            step="0.01"
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
            placeholder="850.00"
          />
        </div>
        <div>
          <Label>Proveedor</Label>
          <Input
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="Opcional"
          />
        </div>
        <div>
          <Label>Nota / motivo</Label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Entrada inicial"
          />
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="button" size="sm" onClick={submit}>
          Guardar lote
        </Button>
      </div>
    </Overlay>
  );
}

// ── Ajuste de stock ────────────────────────────────────────────────────────

interface AdjustStockModalProps {
  open: boolean;
  onClose: () => void;
  lot: ProductLot | null;
  productName: string;
  onAdjusted?: () => void;
}

export function AdjustStockModal({
  open,
  onClose,
  lot,
  productName,
  onAdjusted,
}: AdjustStockModalProps) {
  const toast = useToast();
  const [newQty, setNewQty] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (lot) {
      setNewQty(String(lot.currentQuantity));
      setReason("");
      setError(null);
    }
  }, [lot]);

  if (!open || !lot) return null;

  const submit = () => {
    setError(null);
    const r = adjustStock({
      lotId: lot.id,
      productId: lot.productId,
      warehouseId: lot.warehouseId,
      branchId: lot.branchId,
      newQuantity: Number(newQty),
      reason,
    });
    if (!r.ok) {
      setError(r.error);
      return;
    }
    toast.success(
      `Stock ajustado (${r.delta >= 0 ? "+" : ""}${r.delta}) · lote ${lot.lotNumber}`,
    );
    onAdjusted?.();
    onClose();
  };

  const branch = getBranchById(lot.branchId);

  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
          <SlidersHorizontal className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold">Ajuste de stock</h2>
          <p className="text-xs opacity-60">
            {productName} · lote {lot.lotNumber}
          </p>
        </div>
      </div>

      <div className="mt-3 text-xs opacity-70">
        {branch?.name ?? lot.branchId} · cantidad actual{" "}
        <strong>{lot.currentQuantity}</strong>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-4 grid gap-4">
        <div>
          <Label>Nueva cantidad *</Label>
          <Input
            type="number"
            min="0"
            value={newQty}
            onChange={(e) => setNewQty(e.target.value)}
          />
        </div>
        <div>
          <Label>Motivo del ajuste *</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Conteo físico, merma, daño, corrección…"
          />
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="button" size="sm" onClick={submit}>
          Registrar ajuste
        </Button>
      </div>
    </Overlay>
  );
}
