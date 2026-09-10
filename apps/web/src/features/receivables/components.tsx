"use client";

import * as React from "react";
import { Badge, Button, Input, Label, Modal, Textarea } from "@/components/ui";
import { AlertTriangle, Banknote, CreditCard, FileText, HandCoins, Receipt, Wallet } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useRefetchOnFocus } from "@/components/ui/use-refetch-on-focus";
import { EtiquetaOrigen } from "@/features/ventas/etiqueta-origen";
import {
  last4FieldLabel,
  last4HelpText,
  sanitizeLast4,
  validateLast4,
} from "@/features/pos/payment-validation";
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

/**
 * Carga de facturas pendientes con estado de UI (loading / error / datos).
 *
 * 🔴 Vuelve a pedir sola al recuperar el foco (`useRefetchOnFocus`): sin
 * esto, una venta a crédito hecha en el POS no aparecía aquí hasta recargar
 * la página a mano — la pestaña ya abierta de Cuentas por cobrar nunca
 * volvía a preguntarle al servidor (visto en vivo el 10/09/2026).
 */
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
  const reload = () => setNonce((n) => n + 1);
  useRefetchOnFocus(reload);
  return { rows, error, loading: rows === null && !error, reload };
}

/** Método de cobro de CxC: mismo patrón visual que "Cobrar venta" del POS,
 * pero con dos opciones propias de CxC que el POS no tiene (`other`=Cheque,
 * `manual`=Nota de crédito / otro), así que no reutiliza el `CheckoutMethod`
 * del POS tal cual — solo sus funciones puras para tarjeta/transferencia. */
type ArMethod = "cash" | "card" | "transfer" | "other" | "manual";

function isCardOrTransfer(m: ArMethod): m is "card" | "transfer" {
  return m === "card" || m === "transfer";
}

const AR_METHOD_OPTIONS: ReadonlyArray<{ value: ArMethod; label: string }> = [
  { value: "cash", label: "Efectivo" },
  { value: "card", label: "Tarjeta" },
  { value: "transfer", label: "Transferencia" },
  { value: "other", label: "Cheque" },
  { value: "manual", label: "Nota de crédito / otro" },
];

const AR_METHOD_ICONS: Record<ArMethod, React.ComponentType<{ className?: string }>> = {
  cash: Banknote,
  card: CreditCard,
  transfer: Wallet,
  other: Receipt,
  manual: FileText,
};

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
 *
 * 🔴 Las facturas migradas de Alegra NO se cobran desde aquí y el filtro está
 * EN ESTE COMPONENTE, no en cada pantalla que lo abre: son cinco (pendientes,
 * cobros, mora, estados de cuenta y las que vengan) y basta que una se olvide
 * para registrar en DermaLand un pago que Alegra nunca verá. Aquí se apartan
 * una sola vez, se enseñan con su motivo —un botón muerto sin explicación no
 * explica nada— y nunca entran en el envío.
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
  const [method, setMethod] = React.useState<ArMethod>("cash");
  const [last4, setLast4] = React.useState("");
  const [last4Touched, setLast4Touched] = React.useState(false);
  const [reference, setReference] = React.useState("");
  const [bank, setBank] = React.useState("");
  const [comments, setComments] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setAmounts(
        Object.fromEntries(
          invoices.filter((i) => i.cobrable).map((i) => [i.id, i.balance.toFixed(2)]),
        ),
      );
      setMethod("cash");
      setLast4("");
      setLast4Touched(false);
      setReference("");
      setBank("");
      setComments("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoices.map((i) => i.id).join(",")]);

  const cobrables = invoices.filter((i) => i.cobrable);
  const bloqueadas = invoices.filter((i) => !i.cobrable);
  const items = cobrables
    .map((i) => ({ proformaId: i.id, amount: Number(amounts[i.id] ?? 0) }))
    .filter((i) => i.amount > 0);
  const total = items.reduce((s, i) => s + i.amount, 0);

  const last4Error =
    isCardOrTransfer(method) && last4Touched ? (validateLast4(last4, method).error ?? null) : null;
  const canSubmit =
    items.length > 0 && (!isCardOrTransfer(method) || validateLast4(last4, method).ok);

  function selectMethod(next: ArMethod) {
    setMethod(next);
    setLast4("");
    setLast4Touched(false);
  }

  async function submit() {
    if (isCardOrTransfer(method)) setLast4Touched(true);
    if (!canSubmit) return;
    // No hay columna `last4` en el servidor (solo `p_reference`): para
    // tarjeta/transferencia los 4 dígitos viajan como referencia, igual que
    // hace el POS con su propio `reference`.
    const effectiveReference = isCardOrTransfer(method) ? sanitizeLast4(last4) : reference;
    setBusy(true);
    try {
      await arApi.collect({ items, method, reference: effectiveReference, bank, comments });
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
      title={cobrables.length > 1 ? `Cobrar ${cobrables.length} facturas` : "Registrar cobro"}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">
            Total a aplicar: <strong>{money(total)}</strong>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button>
            <Button onClick={submit} disabled={busy || !canSubmit}>
              {busy ? "Registrando…" : "Registrar cobro"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {bloqueadas.length > 0 && (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            <div className="space-y-1">
              <p className="font-medium">
                {bloqueadas.length === 1
                  ? "Una factura de la selección no se puede cobrar desde DermaLand:"
                  : `${bloqueadas.length} facturas de la selección no se pueden cobrar desde DermaLand:`}
              </p>
              <p>{bloqueadas[0]?.motivoNoCobrable ?? "No admite cobros."}</p>
              <ul className="list-disc pl-4">
                {bloqueadas.map((inv) => (
                  <li key={inv.id}>
                    {inv.number} · {inv.customerName} · {money(inv.balance)}
                  </li>
                ))}
              </ul>
              <p>Se quedan fuera de este cobro; el resto sí se puede aplicar.</p>
            </div>
          </div>
        )}
        {cobrables.length === 0 ? (
          <p className="rounded-lg border border-black/5 p-3 text-sm opacity-70">
            No hay ninguna factura cobrable en la selección.
          </p>
        ) : (
          <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-black/5 p-2">
            {cobrables.map((inv) => (
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
        )}
        <div className="space-y-3">
          <div>
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide opacity-60">
              Método de pago
            </div>
            <div
              className="grid grid-cols-2 gap-2 sm:grid-cols-5"
              role="radiogroup"
              aria-label="Método de pago"
            >
              {AR_METHOD_OPTIONS.map(({ value, label }) => {
                const Icon = AR_METHOD_ICONS[value];
                const active = method === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => selectMethod(value)}
                    className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 px-2 py-3 text-xs font-medium transition ${
                      active
                        ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]/10 text-[color:var(--brand-primary)] shadow-sm"
                        : "border-black/10 bg-white text-black/60 hover:border-black/25 hover:text-black/80"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {isCardOrTransfer(method) && (
            <div className="rounded-xl border-2 border-[color:var(--brand-primary)]/40 bg-[color:var(--brand-primary)]/[0.06] p-4">
              <label htmlFor="ar-last4" className="block text-sm font-semibold">
                {last4FieldLabel(method)} <span className="text-rose-600">*</span>
              </label>
              <input
                id="ar-last4"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                placeholder="1234"
                value={last4}
                onChange={(e) => setLast4(sanitizeLast4(e.target.value))}
                onBlur={() => setLast4Touched(true)}
                aria-label={last4FieldLabel(method)}
                aria-invalid={last4Error != null}
                className={`mt-1.5 h-11 w-40 rounded-lg border px-3 text-lg tracking-[0.4em] tabular-nums focus:outline-none focus:ring-2 ${
                  last4Error
                    ? "border-rose-400 focus:ring-rose-200"
                    : "border-black/15 focus:border-[color:var(--brand-primary)] focus:ring-[color:var(--brand-primary)]/20"
                }`}
              />
              {last4Error ? (
                <p className="mt-1 text-xs font-medium text-rose-600">{last4Error}</p>
              ) : (
                <p className="mt-1 text-xs opacity-60">{last4HelpText(method)}</p>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {(method === "other" || method === "manual") && (
              <div>
                <Label htmlFor="ar-ref">{method === "other" ? "No. de cheque" : "Referencia"}</Label>
                <Input id="ar-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Opcional" />
              </div>
            )}
            {(method === "transfer" || method === "other") && (
              <div>
                <Label htmlFor="ar-bank">Banco</Label>
                <Input id="ar-bank" value={bank} onChange={(e) => setBank(e.target.value)} placeholder="Opcional" />
              </div>
            )}
            <div className="sm:col-span-2">
              <Label htmlFor="ar-comments">Comentarios</Label>
              <Textarea id="ar-comments" rows={2} value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Opcional" />
            </div>
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

/**
 * Botón de cobro de una fila. Si la factura no se puede cobrar queda
 * deshabilitado CON el motivo a la vista (`title` y etiqueta de origen al
 * lado): un botón apagado sin explicación parece un fallo de la aplicación.
 */
export function BotonCobrar({
  row,
  onClick,
}: {
  row: ReceivableRow;
  onClick: () => void;
}) {
  if (!row.cobrable) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <EtiquetaOrigen origen={row.origen} />
        <Button
          size="sm"
          variant="outline"
          disabled
          title={row.motivoNoCobrable ?? "Esta factura no admite cobros."}
        >
          <HandCoins className="h-3.5 w-3.5" /> Cobrar
        </Button>
      </span>
    );
  }
  return (
    <Button size="sm" variant="outline" onClick={onClick}>
      <HandCoins className="h-3.5 w-3.5" /> Cobrar
    </Button>
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
