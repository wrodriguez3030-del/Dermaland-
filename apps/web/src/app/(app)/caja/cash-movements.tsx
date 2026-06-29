"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Undo2,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
} from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";
import type { CashMovement, CashMovementType } from "@/types";

const TYPE_META: Record<
  CashMovementType,
  { label: string; tone: "success" | "warning" | "info"; sign: string }
> = {
  income: { label: "Ingreso de efectivo", tone: "success", sign: "+" },
  withdrawal: { label: "Retiro de efectivo", tone: "warning", sign: "-" },
  refund: { label: "Devolución de dinero", tone: "info", sign: "-" },
};

/**
 * Movimientos manuales de efectivo del turno: registrar ingreso, retiro o
 * devolución, y listar los del turno. Solo efectivo (afecta la caja física).
 * Tras registrar refresca la página para recalcular el "Dinero esperado".
 */
export function CashMovements({
  sessionId,
  movements,
}: {
  sessionId: string;
  movements: CashMovement[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [openType, setOpenType] = React.useState<CashMovementType | null>(null);
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const reset = () => {
    setOpenType(null);
    setAmount("");
    setReason("");
  };

  const submit = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("El monto debe ser mayor a cero.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/cash/${sessionId}/movements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: openType, amount: value, reason: reason.trim() || undefined }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(body.error ?? "No se pudo registrar el movimiento.");
        return;
      }
      toast.show("Movimiento registrado.", "success");
      reset();
      router.refresh();
    } catch {
      toast.error("No se pudo conectar con el servidor. Intenta nuevamente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Movimientos de efectivo</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setOpenType("income")}
            >
              <ArrowDownCircle className="h-4 w-4" /> Ingreso
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setOpenType("withdrawal")}
            >
              <ArrowUpCircle className="h-4 w-4" /> Retiro
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setOpenType("refund")}
            >
              <Undo2 className="h-4 w-4" /> Devolución
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {openType && (
          <div className="rounded-lg border border-black/10 bg-black/[0.02] p-3">
            <p className="mb-2 text-sm font-medium">{TYPE_META[openType].label}</p>
            <div className="grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
              <div>
                <Label>Monto (RD$)</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={amount}
                  autoFocus
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Motivo (opcional)</Label>
                <Textarea
                  rows={1}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ej. fondo para vuelto, pago a proveedor…"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={reset} disabled={saving}>
                  Cancelar
                </Button>
                <Button onClick={submit} disabled={saving}>
                  {saving ? "Guardando…" : "Registrar"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {movements.length === 0 ? (
          <p className="text-sm opacity-60">
            Sin movimientos de efectivo en este turno.
          </p>
        ) : (
          <ul className="divide-y divide-black/5 text-sm">
            {movements.map((m) => {
              const meta = TYPE_META[m.type];
              return (
                <li key={m.id} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    <span className="opacity-60">
                      {m.reason || "—"} · {formatDateTime(m.createdAt)}
                    </span>
                  </div>
                  <span className="tabular-nums font-medium">
                    {meta.sign}
                    {formatCurrency(m.amount)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
