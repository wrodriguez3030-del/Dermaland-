"use client";

import * as React from "react";
import { Button, Select } from "@/components/ui";
import { Modal } from "@/components/ui/modal";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Banknote } from "lucide-react";
import { openCashSession } from "@/features/sales/cash-session-store";
import { useCurrentBranch, useActiveBranches } from "@/features/tenancy/branch-store";

// ─── Abrir caja ─────────────────────────────────────────────────────────────

/**
 * Botón "Abrir caja" + modal con input de monto de apertura.
 * Recarga la página al completar para que el Server Component refresque.
 */
export function AbrirCajaButton() {
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const toast = useToast();
  const { branchId } = useCurrentBranch();
  const activeBranches = useActiveBranches();
  // Sucursal donde se abre la caja (una sola). Por defecto la última usada o la
  // primera activa. El selector global del encabezado se retiró.
  const [branch, setBranch] = React.useState("");
  React.useEffect(() => {
    if (branch) return;
    const seed = branchId || activeBranches[0]?.id || "";
    if (seed) setBranch(seed);
  }, [branch, branchId, activeBranches]);

  const handleOpen = async () => {
    const parsed = parseFloat(amount.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("El monto de apertura debe ser un número válido.");
      return;
    }
    setLoading(true);
    // Abre la caja para la sucursal elegida; el servidor valida y cae a la del
    // contexto si no aplica.
    const result = await openCashSession(parsed, branch || undefined);
    setLoading(false);
    if (result.ok) {
      toast.success("Caja abierta correctamente.");
      setOpen(false);
      // Refrescar el Server Component
      window.location.reload();
    } else {
      toast.error(result.error);
    }
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Banknote className="h-4 w-4" />
        Abrir caja
      </Button>

      <Modal
        open={open}
        title="Abrir sesión de caja"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => void handleOpen()} disabled={loading}>
              {loading ? "Abriendo…" : "Abrir caja"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {activeBranches.length > 1 && (
            <div>
              <Label htmlFor="open-branch">Sucursal</Label>
              <Select
                id="open-branch"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
              >
                {activeBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div>
            <Label htmlFor="opening-amount">Monto de apertura (RD$)</Label>
            <Input
              id="opening-amount"
              type="number"
              min={0}
              step={0.01}
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleOpen(); }}
              autoFocus
            />
          </div>
          <p className="text-xs opacity-60">
            Este monto representa el efectivo inicial en la caja al comenzar la sesión.
          </p>
        </div>
      </Modal>

      <toast.Toast />
    </>
  );
}
