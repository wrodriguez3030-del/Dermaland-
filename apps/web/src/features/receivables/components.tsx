"use client";

import * as React from "react";
import { Badge, Button, Input, Label, Modal, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { AGING_CLASS, AGING_LABEL, AGING_TONE, type AgingBucket } from "./aging";
import { arApi, money, type ReceivableRow } from "./receivables-client";

/** Badge de antigüedad con los colores de la política (verde→rojo oscuro). */
export function AgingBadge({ bucket }: { bucket: AgingBucket }) {
  return (
    <Badge tone={AGING_TONE[bucket]} className={AGING_CLASS[bucket]}>
      {AGING_LABEL[bucket]}
    </Badge>
  );
}

/** Carga de facturas pendientes con estado de UI (loading / error / datos). */
export function usePendingReceivables() {
  const [rows, setRows] = React.useState<ReceivableRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);
  React.useEffect(() => {
    let alive = true;
    arApi
      .pending()
      .then((r) => alive && setRows(r))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Error al cargar."));
    return () => {
      alive = false;
    };
  }, [nonce]);
  return { rows, error, loading: rows === null && !error, reload: () => setNonce((n) => n + 1) };
}

const METHOD_OPTIONS = [
  { value: "cash", label: "Efectivo" },
  { value: "card", label: "Tarjeta" },
  { value: "transfer", label: "Transferencia" },
  { value: "other", label: "Cheque" },
  { value: "manual", label: "Nota de crédito / otro" },
] as const;

export const METHOD_LABEL: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  other: "Cheque",
  manual: "NC / otro",
  azul: "AZUL",
  cardnet: "CardNet",
  visanet: "VisaNet",
  paypal: "PayPal",
};

/**
 * Modal de cobro: aplica un pago (total o parcial) a UNA o VARIAS facturas del
 * listado seleccionado. El monto por factura es editable (parciales); el RPC
 * server valida que ningún pago exceda el saldo.
 */
export function CollectModal({
  open,
  onClose,
  invoices,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  invoices: ReceivableRow[];
  onDone: () => void;
}) {
  const toast = useToast();
  const [amounts, setAmounts] = React.useState<Record<string, string>>({});
  const [method, setMethod] = React.useState("cash");
  const [reference, setReference] = React.useState("");
  const [bank, setBank] = React.useState("");
  const [comments, setComments] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setAmounts(Object.fromEntries(invoices.map((i) => [i.id, i.balance.toFixed(2)])));
      setReference("");
      setBank("");
      setComments("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoices.map((i) => i.id).join(",")]);

  const items = invoices
    .map((i) => ({ proformaId: i.id, amount: Number(amounts[i.id] ?? 0) }))
    .filter((i) => i.amount > 0);
  const total = items.reduce((s, i) => s + i.amount, 0);

  async function submit() {
    setBusy(true);
    try {
      await arApi.collect({ items, method, reference, bank, comments });
      toast.success(`Cobro registrado: ${money(total)}.`);
      onDone();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo registrar el cobro.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={invoices.length > 1 ? `Cobrar ${invoices.length} facturas` : "Registrar cobro"}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">
            Total a aplicar: <strong>{money(total)}</strong>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button>
            <Button onClick={submit} disabled={busy || items.length === 0}>
              {busy ? "Registrando…" : "Registrar cobro"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-black/5 p-2">
          {invoices.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <div className="font-medium">{inv.number} · {inv.customerName}</div>
                <div className="text-xs opacity-60">Saldo: {money(inv.balance)}</div>
              </div>
              <Input
                className="w-32 text-right tabular-nums"
                inputMode="decimal"
                value={amounts[inv.id] ?? ""}
                onChange={(e) => setAmounts((a) => ({ ...a, [inv.id]: e.target.value.replace(/[^\d.]/g, "") }))}
              />
            </div>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="ar-method">Método</Label>
            <Select id="ar-method" value={method} onChange={(e) => setMethod(e.target.value)}>
              {METHOD_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="ar-ref">Referencia / No. cheque</Label>
            <Input id="ar-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Opcional" />
          </div>
          <div>
            <Label htmlFor="ar-bank">Banco</Label>
            <Input id="ar-bank" value={bank} onChange={(e) => setBank(e.target.value)} placeholder="Opcional" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="ar-comments">Comentarios</Label>
            <Textarea id="ar-comments" rows={2} value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Opcional" />
          </div>
        </div>
        <p className="text-xs opacity-60">
          El pago queda en el historial de forma permanente (los pagos nunca se eliminan) y el saldo se
          actualiza automáticamente.
        </p>
      </div>
    </Modal>
  );
}

/** Modal para registrar una promesa de pago. */
export function PromiseModal({
  open,
  onClose,
  clientId,
  clientName,
  proformaId,
  suggestedAmount,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  clientId?: string | null;
  clientName: string;
  proformaId?: string | null;
  suggestedAmount?: number;
  onDone: () => void;
}) {
  const toast = useToast();
  const [date, setDate] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setDate("");
      setAmount(suggestedAmount ? suggestedAmount.toFixed(2) : "");
      setNotes("");
    }
  }, [open, suggestedAmount]);

  async function submit() {
    setBusy(true);
    try {
      await arApi.createPromise({
        clientId: clientId ?? null,
        clientName,
        proformaId: proformaId ?? null,
        promisedDate: date,
        amount: Number(amount),
        notes,
      });
      toast.success("Promesa de pago registrada.");
      onDone();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo registrar la promesa.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={`Promesa de pago — ${clientName}`}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button onClick={submit} disabled={busy || !date || !(Number(amount) > 0)}>
            {busy ? "Guardando…" : "Registrar promesa"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="pr-date">Fecha comprometida</Label>
          <Input id="pr-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="pr-amount">Monto (RD$)</Label>
          <Input
            id="pr-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="pr-notes">Observaciones</Label>
          <Textarea id="pr-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
        </div>
      </div>
    </Modal>
  );
}

/** Enlaces de contacto para gestión de cobranza (llamar / WhatsApp / correo). */
export function contactLinks(phone: string | null, email: string | null, mensaje: string) {
  const tel = phone?.replace(/[^\d+]/g, "") ?? "";
  const wa = tel.replace(/^\+/, "").replace(/^1?/, "1");
  return {
    tel: tel ? `tel:${tel}` : null,
    whatsapp: tel ? `https://wa.me/${wa}?text=${encodeURIComponent(mensaje)}` : null,
    mailto: email ? `mailto:${email}?subject=${encodeURIComponent("Estado de cuenta DermaLand")}&body=${encodeURIComponent(mensaje)}` : null,
  };
}
