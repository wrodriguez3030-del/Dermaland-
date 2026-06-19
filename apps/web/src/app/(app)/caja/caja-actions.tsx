"use client";

import * as React from "react";
import { Button } from "@/components/ui";
import { Modal } from "@/components/ui/modal";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Banknote, Lock } from "lucide-react";
import {
  openCashSession,
  closeCashSession,
} from "@/features/sales/cash-session-store";

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

  const handleOpen = async () => {
    const parsed = parseFloat(amount.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("Ingresá un monto de apertura válido (>= 0).");
      return;
    }
    setLoading(true);
    const result = await openCashSession(parsed);
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

// ─── Cerrar caja ─────────────────────────────────────────────────────────────

interface CerrarCajaButtonProps {
  sessionId: string;
}

/**
 * Botón "Cerrar caja" + modal con input de efectivo contado.
 * Recarga la página al completar para que el Server Component refresque.
 */
export function CerrarCajaButton({ sessionId }: CerrarCajaButtonProps) {
  const [open, setOpen] = React.useState(false);
  const [counted, setCounted] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const toast = useToast();

  const handleClose = async () => {
    const parsed = parseFloat(counted.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("Ingresá el efectivo contado (>= 0).");
      return;
    }
    setLoading(true);
    const result = await closeCashSession(sessionId, parsed);
    setLoading(false);
    if (result.ok) {
      toast.success("Caja cerrada correctamente.");
      setOpen(false);
      // Refrescar el Server Component
      window.location.reload();
    } else {
      toast.error(result.error);
    }
  };

  return (
    <>
      <Button size="sm" variant="danger" onClick={() => setOpen(true)}>
        <Lock className="h-4 w-4" />
        Cerrar caja
      </Button>

      <Modal
        open={open}
        title="Cerrar sesión de caja"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" variant="danger" onClick={() => void handleClose()} disabled={loading}>
              {loading ? "Cerrando…" : "Confirmar cierre"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="counted-cash">Efectivo contado (RD$)</Label>
            <Input
              id="counted-cash"
              type="number"
              min={0}
              step={0.01}
              placeholder="0.00"
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleClose(); }}
              autoFocus
            />
          </div>
          <p className="text-xs opacity-60">
            Diferencia mayor a RD$50 requerirá autorización del supervisor.
          </p>
        </div>
      </Modal>

      <toast.Toast />
    </>
  );
}

