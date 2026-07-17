"use client";

import * as React from "react";
import { AlertTriangle, PackagePlus, SlidersHorizontal } from "lucide-react";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import {
  addLotAnywhere,
  adjustStockAnywhere,
  expiryError,
} from "@/features/inventory/lot-store";
import { receptionShelfLifeCheck } from "@/features/inventory/reception-shelf-life";
import {
  useActiveBranches,
  defaultWarehouseForBranch,
  resolveBranchName,
} from "@/features/tenancy/branch-store";
import { LaboratorySelect } from "@/features/products/components/laboratory-select";
import { useLaboratoriesList } from "@/features/products/catalog-store";
import { useProduct, setProductLaboratoryAnywhere } from "@/features/products/product-store";
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
  /** Sucursal pre-seleccionada (la sucursal activa del usuario). */
  defaultBranchId?: string;
}

export function NewLotModal({
  open,
  onClose,
  productId,
  productName,
  requireExpiry = true,
  onCreated,
  defaultBranchId,
}: NewLotModalProps) {
  const toast = useToast();
  const branches = useActiveBranches();
  // El laboratorio pertenece al PRODUCTO (no al lote): lo leemos para
  // preseleccionarlo y, si cambia, lo guardamos en el producto al agregar stock.
  const product = useProduct(productId);
  const currentLabId = product?.laboratoryId ?? "";
  const laboratories = useLaboratoriesList();
  const [branchId, setBranchId] = React.useState(defaultBranchId ?? "");
  const [lotNumber, setLotNumber] = React.useState("");
  const [quantity, setQuantity] = React.useState("");
  const [expiresAt, setExpiresAt] = React.useState("");
  const [unitCost, setUnitCost] = React.useState("");
  const [laboratoryId, setLaboratoryId] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [missing, setMissing] = React.useState<Set<string>>(new Set());
  const [error, setError] = React.useState<string | null>(null);
  // Confirmación explícita para recibir un lote por debajo del mínimo del lab.
  const [confirmBelowMin, setConfirmBelowMin] = React.useState(false);

  // Regla de vencimiento del laboratorio seleccionado (o el actual del producto).
  const shelfCheck = receptionShelfLifeCheck({
    expiresAt,
    minShelfLifeDays: laboratories.find(
      (l) => l.id === (laboratoryId || currentLabId),
    )?.minShelfLifeDays,
  });

  // Resetear formulario solo al ABRIR el modal (no al cambiar defaultBranchId en caliente).
  // Depender también de defaultBranchId causaba que el formulario se borrara mientras
  // el usuario lo llenaba si el padre actualizaba ese prop.
  React.useEffect(() => {
    if (open) {
      setBranchId(defaultBranchId ?? "");
      setLotNumber("");
      setQuantity("");
      setExpiresAt("");
      setUnitCost("");
      setLaboratoryId(currentLabId);
      setNotes("");
      setMissing(new Set());
      setError(null);
      setConfirmBelowMin(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Si el producto (y su laboratorio) carga DESPUÉS de abrir el modal,
  // preselecciona el laboratorio actual sin pisar una elección del usuario.
  React.useEffect(() => {
    if (open && currentLabId && laboratoryId === "") setLaboratoryId(currentLabId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentLabId]);

  const isMissing = (k: string) => missing.has(k);

  if (!open) return null;

  const reset = () => {
    setBranchId(defaultBranchId ?? "");
    setLotNumber("");
    setQuantity("");
    setExpiresAt("");
    setUnitCost("");
    setLaboratoryId(currentLabId);
    setNotes("");
    setMissing(new Set());
    setError(null);
    setConfirmBelowMin(false);
  };

  const submit = async () => {
    setError(null);
    // Validaciones de campo antes de enviar (mensajes claros, no técnicos).
    const fieldErrors = new Set<string>();
    if (!branchId) fieldErrors.add("branchId");
    if (!lotNumber.trim()) fieldErrors.add("lotNumber");
    if (!(Number(quantity) > 0)) fieldErrors.add("initialQuantity");
    if (unitCost.trim() !== "" && Number(unitCost) < 0) fieldErrors.add("unitCost");
    const expErr = expiryError(
      expiresAt ? new Date(expiresAt).toISOString() : "",
      requireExpiry,
    );
    if (expErr) fieldErrors.add("expiresAt");
    if (fieldErrors.size > 0) {
      setMissing(fieldErrors);
      setError(
        expErr ??
          (fieldErrors.has("initialQuantity")
            ? "La cantidad debe ser mayor que cero."
            : fieldErrors.has("unitCost")
              ? "El costo no puede ser negativo."
              : "Completa los campos obligatorios (sucursal, lote, cantidad y vencimiento)."),
      );
      return;
    }
    // Regla del laboratorio: si el lote llega bajo el mínimo de vida útil, exigir
    // confirmación explícita antes de recibirlo.
    if (shelfCheck.belowMinimum && !confirmBelowMin) {
      setMissing(new Set(["expiresAt"]));
      setError(
        `Este lote vence en ${shelfCheck.remainingDays} días y el laboratorio exige un mínimo de ${shelfCheck.minDays}. Marca "Recibir bajo mínimo" para continuar.`,
      );
      return;
    }
    const r = await addLotAnywhere(
      {
        productId,
        branchId,
        warehouseId: branchId ? defaultWarehouseForBranch(branchId) : "",
        lotNumber,
        initialQuantity: Number(quantity),
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : "",
        unitCost: Number(unitCost) || 0,
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
    // El laboratorio pertenece al producto: si se eligió uno distinto al actual,
    // actualizamos el producto (cubre "producto sin laboratorio" y correcciones).
    // No bloquea el guardado del stock si falla; se avisa de forma suave.
    if (laboratoryId && laboratoryId !== currentLabId) {
      const lr = await setProductLaboratoryAnywhere(productId, laboratoryId);
      if (!lr.ok) {
        toast.error("Stock guardado, pero no se pudo actualizar el laboratorio del producto.");
      }
    }
    toast.success(`Stock agregado: ${r.lot.currentQuantity} unidades en lote ${r.lot.lotNumber}.`);
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
          <h2 className="text-base font-semibold">Agregar stock al producto</h2>
          <p className="text-xs opacity-60">{productName}</p>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
        El stock se agrega por <strong>lote</strong>. El producto existe globalmente, pero las existencias viven en cada sucursal.
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
            {branches.map((b) => (
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
          {shelfCheck.belowMinimum && (
            <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div className="flex-1">
                  <p>
                    Vence en <strong>{shelfCheck.remainingDays} días</strong>; el
                    laboratorio exige un mínimo de <strong>{shelfCheck.minDays} días</strong> al recibir.
                  </p>
                  <label className="mt-1.5 flex items-center gap-2 font-medium">
                    <input
                      type="checkbox"
                      checked={confirmBelowMin}
                      onChange={(e) => setConfirmBelowMin(e.target.checked)}
                      className="h-3.5 w-3.5"
                    />
                    Recibir bajo mínimo (bajo mi responsabilidad)
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
        <div>
          <Label>Costo del lote (unidad)</Label>
          <Input
            type="number"
            step="0.01"
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
            placeholder="850.00"
            className={isMissing("unitCost") ? "border-rose-400" : undefined}
          />
        </div>
        <div>
          <LaboratorySelect
            value={laboratoryId}
            onChange={setLaboratoryId}
            laboratories={laboratories}
            locked={!!currentLabId}
          />
          {!currentLabId && (
            <p className="mt-1 text-xs opacity-60">
              Selecciona o crea el laboratorio del producto. Se guardará en el producto.
            </p>
          )}
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
          Guardar stock
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

  const submit = async () => {
    setError(null);
    const r = await adjustStockAnywhere({
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
        {resolveBranchName(lot.branchId)} · cantidad actual{" "}
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
