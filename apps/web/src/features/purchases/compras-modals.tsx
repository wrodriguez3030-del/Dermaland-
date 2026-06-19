"use client";

import * as React from "react";
import { AlertTriangle, Plus, Trash2, FileText, Wallet, Repeat } from "lucide-react";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { listActiveBranches } from "@/features/tenancy/branch-store";
import { mockProducts } from "@/lib/mock-data/catalog";
import {
  saveExpense,
  saveInvoice,
  saveRecurring,
  EXPENSE_CATEGORIES,
  type Frequency,
  type PaymentMethod,
  type SupplierInvoiceItem,
} from "@/features/purchases/compras-store";

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "transferencia", label: "Transferencia" },
  { value: "cheque", label: "Cheque" },
  { value: "otro", label: "Otro" },
];

function Overlay({
  title,
  icon: Icon,
  children,
  onClose,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
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
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--brand-primary)]/15 text-[color:var(--brand-accent)]">
            <Icon className="h-5 w-5" />
          </span>
          <h2 className="text-base font-semibold">{title}</h2>
        </div>
        {children}
      </div>
    </div>
  );
}

function Err({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="mb-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
      <AlertTriangle className="mt-0.5 h-4 w-4" />
      <span>{error}</span>
    </div>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

// ── Gasto / gasto menor ───────────────────────────────────────────────────────

export function ExpenseModal({
  open,
  onClose,
  petty = false,
}: {
  open: boolean;
  onClose: () => void;
  petty?: boolean;
}) {
  const toast = useToast();
  const branches = listActiveBranches();
  const [date, setDate] = React.useState(today());
  const [category, setCategory] = React.useState(EXPENSE_CATEGORIES[0]!);
  const [payee, setPayee] = React.useState("");
  const [concept, setConcept] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<PaymentMethod>(petty ? "efectivo" : "transferencia");
  const [last4, setLast4] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [responsible, setResponsible] = React.useState("");
  const [branchId, setBranchId] = React.useState(branches[0]?.id ?? "");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  if (!open) return null;
  const needsLast4 = method === "tarjeta" || method === "transferencia";

  const submit = async () => {
    const r = await saveExpense("create", {
      date,
      category,
      payee,
      concept,
      amount: Number(amount),
      method,
      last4: needsLast4 ? last4 : undefined,
      reference: !needsLast4 ? reference : undefined,
      branchId,
      petty,
      responsible: petty ? responsible : undefined,
      note,
    });
    if (!r.ok) return setError(r.error);
    if (r.expense.cashWarning) {
      toast.error("Gasto registrado, pero no hay caja abierta para descontar el efectivo.");
    } else {
      toast.success(petty ? "Gasto menor registrado." : "Gasto registrado.");
    }
    onClose();
  };

  return (
    <Overlay title={petty ? "Nuevo gasto menor" : "Nuevo gasto / pago"} icon={Wallet} onClose={onClose}>
      <Err error={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Fecha *</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label>Categoría</Label>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>{petty ? "Beneficiario" : "Proveedor / beneficiario"}</Label>
          <Input value={payee} onChange={(e) => setPayee(e.target.value)} />
        </div>
        <div>
          <Label>Concepto *</Label>
          <Input value={concept} onChange={(e) => setConcept(e.target.value)} />
        </div>
        <div>
          <Label>Monto (DOP) *</Label>
          <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <Label>Método de pago</Label>
          <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </Select>
        </div>
        {needsLast4 ? (
          <div>
            <Label>Últimos 4 dígitos</Label>
            <Input value={last4} onChange={(e) => setLast4(e.target.value)} placeholder="4242" maxLength={4} />
          </div>
        ) : (
          <div>
            <Label>Referencia / comprobante</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
        )}
        <div>
          <Label>Sucursal</Label>
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
        </div>
        {petty && (
          <div>
            <Label>Responsable</Label>
            <Input value={responsible} onChange={(e) => setResponsible(e.target.value)} />
          </div>
        )}
        <div className="sm:col-span-2">
          <Label>Nota</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" onClick={submit}>Registrar</Button>
      </div>
      <toast.Toast />
    </Overlay>
  );
}

// ── Pago recurrente ──────────────────────────────────────────────────────────

const FREQS: { value: Frequency; label: string }[] = [
  { value: "semanal", label: "Semanal" },
  { value: "quincenal", label: "Quincenal" },
  { value: "mensual", label: "Mensual" },
  { value: "trimestral", label: "Trimestral" },
  { value: "anual", label: "Anual" },
];

export function RecurringModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const branches = listActiveBranches();
  const [name, setName] = React.useState("");
  const [supplier, setSupplier] = React.useState("");
  const [category, setCategory] = React.useState(EXPENSE_CATEGORIES[0]!);
  const [amount, setAmount] = React.useState("");
  const [frequency, setFrequency] = React.useState<Frequency>("mensual");
  const [payDay, setPayDay] = React.useState("");
  const [startDate, setStartDate] = React.useState(today());
  const [endDate, setEndDate] = React.useState("");
  const [method, setMethod] = React.useState<PaymentMethod>("transferencia");
  const [branchId, setBranchId] = React.useState(branches[0]?.id ?? "");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  if (!open) return null;

  const submit = async () => {
    const r = await saveRecurring("create", {
      name,
      supplier: supplier || undefined,
      category,
      amount: Number(amount),
      frequency,
      payDay: payDay ? Number(payDay) : undefined,
      startDate,
      endDate: endDate || undefined,
      branchId,
      method,
      note,
    });
    if (!r.ok) return setError(r.error);
    toast.success("Pago recurrente creado.");
    onClose();
  };

  return (
    <Overlay title="Nuevo pago recurrente" icon={Repeat} onClose={onClose}>
      <Err error={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>Nombre *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alquiler local Santiago" />
        </div>
        <div>
          <Label>Proveedor</Label>
          <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
        </div>
        <div>
          <Label>Categoría</Label>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {EXPENSE_CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
          </Select>
        </div>
        <div>
          <Label>Monto (DOP) *</Label>
          <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <Label>Frecuencia</Label>
          <Select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
            {FREQS.map((f) => (<option key={f.value} value={f.value}>{f.label}</option>))}
          </Select>
        </div>
        <div>
          <Label>Día de pago</Label>
          <Input type="number" value={payDay} onChange={(e) => setPayDay(e.target.value)} placeholder="1-31" />
        </div>
        <div>
          <Label>Método</Label>
          <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {METHODS.map((m) => (<option key={m.value} value={m.value}>{m.label}</option>))}
          </Select>
        </div>
        <div>
          <Label>Fecha inicio</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <Label>Fecha final (opcional)</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div>
          <Label>Sucursal</Label>
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label>Nota</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" onClick={submit}>Crear</Button>
      </div>
      <toast.Toast />
    </Overlay>
  );
}

// ── Factura de proveedor ──────────────────────────────────────────────────────

interface Row {
  productId: string;
  name: string;
  quantity: string;
  unitCost: string;
  itbis: string;
  lotNumber: string;
  expiresAt: string;
}
const emptyRow = (): Row => ({
  productId: "",
  name: "",
  quantity: "1",
  unitCost: "",
  itbis: "0",
  lotNumber: "",
  expiresAt: "",
});

export function InvoiceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const branches = listActiveBranches();
  const [supplierName, setSupplierName] = React.useState("");
  const [supplierRnc, setSupplierRnc] = React.useState("");
  const [number, setNumber] = React.useState("");
  const [ncf, setNcf] = React.useState("");
  const [issueDate, setIssueDate] = React.useState(today());
  const [dueDate, setDueDate] = React.useState("");
  const [branchId, setBranchId] = React.useState(branches[0]?.id ?? "");
  const [addToInventory, setAddToInventory] = React.useState(false);
  const [rows, setRows] = React.useState<Row[]>([emptyRow()]);
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  if (!open) return null;

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((r) => r.map((row, ix) => (ix === i ? { ...row, ...patch } : row)));

  const total = rows.reduce(
    (s, r) => s + (Number(r.quantity) || 0) * (Number(r.unitCost) || 0) + (Number(r.itbis) || 0),
    0,
  );

  const submit = async () => {
    const items: SupplierInvoiceItem[] = rows
      .filter((r) => (r.name.trim() || r.productId) && Number(r.quantity) > 0)
      .map((r) => {
        const product = mockProducts.find((p) => p.id === r.productId);
        const qty = Number(r.quantity) || 0;
        const cost = Number(r.unitCost) || 0;
        const itbis = Number(r.itbis) || 0;
        return {
          productId: r.productId || undefined,
          name: r.name.trim() || product?.name || "Ítem",
          quantity: qty,
          unitCost: cost,
          itbis,
          total: qty * cost + itbis,
          lotNumber: r.lotNumber || undefined,
          expiresAt: r.expiresAt ? new Date(r.expiresAt).toISOString() : undefined,
          branchId,
        };
      });
    const r = await saveInvoice("create", {
      supplierName,
      supplierRnc,
      number,
      ncf,
      issueDate,
      dueDate,
      branchId,
      items,
      notes,
      addToInventory,
    });
    if (!r.ok) return setError(r.error);
    toast.success(`Factura ${r.invoice.number} registrada.`);
    onClose();
  };

  return (
    <Overlay title="Nueva factura de proveedor" icon={FileText} onClose={onClose}>
      <Err error={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Proveedor *</Label>
          <Input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
        </div>
        <div>
          <Label>RNC / cédula</Label>
          <Input value={supplierRnc} onChange={(e) => setSupplierRnc(e.target.value)} />
        </div>
        <div>
          <Label>N° factura *</Label>
          <Input value={number} onChange={(e) => setNumber(e.target.value)} />
        </div>
        <div>
          <Label>NCF proveedor</Label>
          <Input value={ncf} onChange={(e) => setNcf(e.target.value)} placeholder="B01..." />
        </div>
        <div>
          <Label>Fecha emisión</Label>
          <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
        </div>
        <div>
          <Label>Vencimiento</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div>
          <Label>Sucursal *</Label>
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
          </Select>
        </div>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={addToInventory} onChange={(e) => setAddToInventory(e.target.checked)} />
            Entrada a inventario (productos)
          </label>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold">Productos / servicios</span>
          <Button variant="outline" size="sm" onClick={() => setRows((r) => [...r, emptyRow()])}>
            <Plus className="h-4 w-4" /> Agregar
          </Button>
        </div>
        <div className="space-y-3">
          {rows.map((row, i) => (
            <div key={i} className="rounded-lg border border-black/10 p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Producto (opcional)</Label>
                  <Select
                    value={row.productId}
                    onChange={(e) => {
                      const p = mockProducts.find((x) => x.id === e.target.value);
                      setRow(i, { productId: e.target.value, name: p?.name ?? row.name, unitCost: p ? String(p.cost || "") : row.unitCost });
                    }}
                  >
                    <option value="">— Servicio / libre —</option>
                    {mockProducts.slice(0, 200).map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Descripción</Label>
                  <Input value={row.name} onChange={(e) => setRow(i, { name: e.target.value })} />
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div>
                  <Label className="text-xs">Cantidad</Label>
                  <Input type="number" value={row.quantity} onChange={(e) => setRow(i, { quantity: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Costo unit.</Label>
                  <Input type="number" step="0.01" value={row.unitCost} onChange={(e) => setRow(i, { unitCost: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">ITBIS</Label>
                  <Input type="number" step="0.01" value={row.itbis} onChange={(e) => setRow(i, { itbis: e.target.value })} />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    aria-label="Eliminar fila"
                    title="Eliminar fila"
                    onClick={() => setRows((r) => (r.length === 1 ? r : r.filter((_, ix) => ix !== i)))}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {addToInventory && row.productId && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">N° de lote</Label>
                    <Input value={row.lotNumber} onChange={(e) => setRow(i, { lotNumber: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Vencimiento</Label>
                    <Input type="date" value={row.expiresAt} onChange={(e) => setRow(i, { expiresAt: e.target.value })} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <Label>Notas</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm">Total estimado: <strong>{total.toFixed(2)}</strong></span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={submit}>Registrar factura</Button>
        </div>
      </div>
      <toast.Toast />
    </Overlay>
  );
}
