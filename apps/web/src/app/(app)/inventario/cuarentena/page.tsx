"use client";

import * as React from "react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  Button,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  Input,
  Textarea,
  Label,
} from "@/components/ui";
import { Modal } from "@/components/ui/modal";
import { RowActions } from "@/components/ui/row-actions";
import { useToast } from "@/components/ui/toast";
import { lotStatusBadge } from "@/features/inventory/lot-badges";
import {
  useAllLots,
  expiryStatus,
  releaseLotAnywhere,
  recallLotAnywhere,
  updateLotNoteLocal,
} from "@/features/inventory/lot-store";
import {
  resolveBranchName,
  useActiveBranches,
} from "@/features/tenancy/branch-store";
import { getProductById } from "@/lib/mock-data/catalog";
import { formatDate } from "@/lib/utils/format";
import {
  ShieldAlert,
  Eye,
  ShieldCheck,
  Pencil,
  Lock,
  AlertTriangle,
} from "lucide-react";
import type { ProductLot } from "@/types";

// ─── Modal: liberar lote ─────────────────────────────────────────────────────

interface ReleaseLotModalProps {
  lot: ProductLot | null;
  onClose: () => void;
  onDone: () => void;
}

function ReleaseLotModal({ lot, onClose, onDone }: ReleaseLotModalProps) {
  const [reason, setReason] = React.useState("");
  const [responsible, setResponsible] = React.useState("");
  const [confirmed, setConfirmed] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const toast = useToast();
  const activeBranches = useActiveBranches();

  React.useEffect(() => {
    if (!lot) return;
    setReason("");
    setResponsible("");
    setConfirmed(false);
    setError(null);
  }, [lot]);

  if (!lot) return null;

  const p = getProductById(lot.productId);
  const branchName = resolveBranchName(lot.branchId);
  const activeBranchIds = new Set(activeBranches.map((b) => b.id));
  const isExpired = expiryStatus(lot.expiresAt) === "expired";
  const isInactiveBranch = !activeBranchIds.has(lot.branchId);
  const isZeroQty = lot.currentQuantity === 0;

  function validate(): string | null {
    if (!reason.trim()) return "El motivo de liberación es obligatorio.";
    if (!confirmed) return "Confirmá que el lote fue revisado antes de liberarlo.";
    if (isExpired) return "No se puede liberar un lote vencido.";
    if (isInactiveBranch) return "La sucursal de este lote está inactiva.";
    if (isZeroQty) return "No se puede liberar un lote con cantidad 0.";
    return null;
  }

  async function handleRelease() {
    const err = validate();
    if (err) { setError(err); return; }
    setLoading(true);
    setError(null);
    const res = await releaseLotAnywhere(lot!.id, { reason: reason.trim(), responsible: responsible.trim() || undefined });
    setLoading(false);
    if (!res.ok) { setError(res.error); return; }
    toast.success("Lote liberado correctamente.");
    onDone();
  }

  return (
    <>
      <Modal
        open={!!lot}
        title="Liberar lote de cuarentena"
        onClose={onClose}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleRelease} disabled={loading}>
              {loading ? "Liberando…" : "Liberar lote"}
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm">
          <p className="text-[color:var(--brand-fg)]/70">
            Este lote volverá a estar disponible para venta si cumple las condiciones de calidad.
          </p>

          <div className="rounded-lg border border-black/5 bg-black/[0.02] p-3 space-y-1 text-xs">
            <div className="flex gap-2"><span className="opacity-60 w-24">Producto</span><span className="font-medium">{p?.name ?? lot.productId}</span></div>
            <div className="flex gap-2"><span className="opacity-60 w-24">Lote</span><span className="font-mono">{lot.lotNumber}</span></div>
            <div className="flex gap-2"><span className="opacity-60 w-24">Sucursal</span><span>{branchName}</span></div>
            <div className="flex gap-2"><span className="opacity-60 w-24">Cantidad</span><span className="tabular-nums">{lot.currentQuantity}</span></div>
            <div className="flex gap-2"><span className="opacity-60 w-24">Motivo actual</span><span>{lot.notes ?? "—"}</span></div>
            <div className="flex gap-2"><span className="opacity-60 w-24">Recibido</span><span>{formatDate(lot.receivedAt)}</span></div>
            <div className="flex gap-2"><span className="opacity-60 w-24">Estado</span><span>{lotStatusBadge(lot.status)}</span></div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="release-reason">Motivo de liberación <span className="text-rose-600">*</span></Label>
            <Textarea
              id="release-reason"
              placeholder="Describí el resultado de la inspección y por qué se libera el lote…"
              value={reason}
              onChange={(e) => { setReason(e.target.value); setError(null); }}
              rows={3}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="release-responsible">Responsable (opcional)</Label>
            <Input
              id="release-responsible"
              placeholder="Nombre del responsable de la revisión"
              value={responsible}
              onChange={(e) => setResponsible(e.target.value)}
            />
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-gray-300"
              checked={confirmed}
              onChange={(e) => { setConfirmed(e.target.checked); setError(null); }}
              aria-label="Confirmar revisión del lote"
            />
            <span className="text-xs leading-relaxed">
              Confirmo que este lote fue revisado y puede volver a venderse.
            </span>
          </label>

          {error && (
            <p role="alert" className="text-xs text-rose-700 font-medium">
              {error}
            </p>
          )}
        </div>
      </Modal>
      <toast.Toast />
    </>
  );
}

// ─── Modal: recall ───────────────────────────────────────────────────────────

interface RecallLotModalProps {
  lot: ProductLot | null;
  onClose: () => void;
  onDone: () => void;
}

function RecallLotModal({ lot, onClose, onDone }: RecallLotModalProps) {
  const [reason, setReason] = React.useState("");
  const [note, setNote] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const toast = useToast();

  React.useEffect(() => {
    if (!lot) return;
    setReason("");
    setNote("");
    setError(null);
  }, [lot]);

  if (!lot) return null;

  const p = getProductById(lot.productId);

  async function handleRecall() {
    if (!reason.trim()) { setError("El motivo del recall es obligatorio."); return; }
    setLoading(true);
    setError(null);
    const fullReason = note.trim() ? `${reason.trim()} — ${note.trim()}` : reason.trim();
    const res = await recallLotAnywhere(lot!.id, { reason: fullReason });
    setLoading(false);
    if (!res.ok) { setError(res.error); return; }
    toast.success("Lote enviado a recall correctamente.");
    onDone();
  }

  return (
    <>
      <Modal
        open={!!lot}
        title="Enviar lote a recall"
        onClose={onClose}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button size="sm" variant="danger" onClick={handleRecall} disabled={loading}>
              {loading ? "Procesando…" : "Confirmar recall"}
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm">
          <p className="text-[color:var(--brand-fg)]/70">
            <strong>{p?.name ?? lot.productId}</strong> — Lote <span className="font-mono">{lot.lotNumber}</span>
          </p>

          <div className="space-y-1">
            <Label htmlFor="recall-reason">Motivo del recall <span className="text-rose-600">*</span></Label>
            <Textarea
              id="recall-reason"
              placeholder="Indicá el motivo por el que este lote debe ser retirado…"
              value={reason}
              onChange={(e) => { setReason(e.target.value); setError(null); }}
              rows={3}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="recall-note">Nota adicional (opcional)</Label>
            <Input
              id="recall-note"
              placeholder="Información adicional de contexto"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {error && (
            <p role="alert" className="text-xs text-rose-700 font-medium">
              {error}
            </p>
          )}
        </div>
      </Modal>
      <toast.Toast />
    </>
  );
}

// ─── Modal: editar motivo ────────────────────────────────────────────────────

interface EditNoteModalProps {
  lot: ProductLot | null;
  onClose: () => void;
  onDone: () => void;
}

function EditNoteModal({ lot, onClose, onDone }: EditNoteModalProps) {
  const [note, setNote] = React.useState("");
  const toast = useToast();

  React.useEffect(() => {
    if (lot) setNote(lot.notes ?? "");
  }, [lot]);

  if (!lot) return null;

  function handleSave() {
    updateLotNoteLocal(lot!.id, note.trim());
    toast.success("Motivo actualizado.");
    onDone();
  }

  return (
    <>
      <Modal
        open={!!lot}
        title="Cambiar motivo / nota"
        onClose={onClose}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
            <Button size="sm" onClick={handleSave}>Guardar</Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p className="opacity-70">
            Lote <span className="font-mono">{lot.lotNumber}</span>
          </p>
          <div className="space-y-1">
            <Label htmlFor="edit-note">Motivo / Nota</Label>
            <Textarea
              id="edit-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Describí el motivo de cuarentena o cualquier observación…"
            />
          </div>
        </div>
      </Modal>
      <toast.Toast />
    </>
  );
}

// ─── Página principal ────────────────────────────────────────────────────────

export default function CuarentenaPage() {
  const allLots = useAllLots();
  const lots = allLots.filter((l) => l.status === "quarantine");

  const [releaseLot, setReleaseLot] = React.useState<ProductLot | null>(null);
  const [recallLot, setRecallLot] = React.useState<ProductLot | null>(null);
  const [editNoteLot, setEditNoteLot] = React.useState<ProductLot | null>(null);

  // Force re-render after modal action (hooks auto-update via CHANGE_EVENT)
  const [, bump] = React.useReducer((n: number) => n + 1, 0);

  function handleDone() {
    setReleaseLot(null);
    setRecallLot(null);
    setEditNoteLot(null);
    bump();
  }

  return (
    <>
      <PageHeader
        title="Cuarentena"
        description="Lotes bloqueados para venta. Liberación requiere revisión, motivo y autorización."
        breadcrumbs={[
          { label: "Inventario", href: "/inventario" },
          { label: "Cuarentena" },
        ]}
        actions={
          <Button size="sm" variant="outline">
            <ShieldAlert className="h-4 w-4" />
            Mover lote a cuarentena
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Producto</TH>
                <TH>Lote</TH>
                <TH>Sucursal</TH>
                <TH className="text-right">Cantidad</TH>
                <TH>Recibido</TH>
                <TH>Estado</TH>
                <TH>Motivo</TH>
                <TH className="text-right pr-4">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {lots.length === 0 && (
                <TR>
                  <TD colSpan={8} className="py-8 text-center text-sm opacity-60">
                    Sin lotes en cuarentena.
                  </TD>
                </TR>
              )}
              {lots.map((lot) => {
                const p = getProductById(lot.productId);
                const branchName = resolveBranchName(lot.branchId);
                const expired = expiryStatus(lot.expiresAt) === "expired";

                return (
                  <TR key={lot.id}>
                    <TD>
                      <div className="text-sm">{p?.name}</div>
                      <div className="font-mono text-xs opacity-60">{p?.sku}</div>
                    </TD>
                    <TD className="font-mono text-xs">{lot.lotNumber}</TD>
                    <TD className="text-sm">{branchName}</TD>
                    <TD className="text-right tabular-nums">
                      {lot.currentQuantity}
                    </TD>
                    <TD className="text-xs">{formatDate(lot.receivedAt)}</TD>
                    <TD>{lotStatusBadge(lot.status)}</TD>
                    <TD className="text-xs opacity-80 max-w-[200px] truncate">{lot.notes ?? "—"}</TD>
                    <TD className="text-right pr-4">
                      <RowActions
                        variant="inline"
                        viewHref={`/productos/${lot.productId}`}
                        customActions={[
                          {
                            label: "Liberar lote",
                            icon: ShieldCheck,
                            onClick: () => setReleaseLot(lot),
                            disabled: expired,
                            disabledReason: expired ? "Lote vencido — no se puede liberar." : undefined,
                          },
                          {
                            label: "Cambiar motivo / nota",
                            icon: Pencil,
                            onClick: () => setEditNoteLot(lot),
                          },
                          {
                            label: "Mantener bloqueado",
                            icon: Lock,
                            confirm: {
                              title: "Mantener en cuarentena",
                              message: `El lote ${lot.lotNumber} continuará bloqueado para venta.`,
                            },
                            onClick: () => {/* no-op: sigue en cuarentena */},
                          },
                          {
                            label: "Enviar a recall / retirar",
                            icon: AlertTriangle,
                            onClick: () => setRecallLot(lot),
                            destructive: true,
                          },
                        ]}
                      />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <ReleaseLotModal
        lot={releaseLot}
        onClose={() => setReleaseLot(null)}
        onDone={handleDone}
      />
      <RecallLotModal
        lot={recallLot}
        onClose={() => setRecallLot(null)}
        onDone={handleDone}
      />
      <EditNoteModal
        lot={editNoteLot}
        onClose={() => setEditNoteLot(null)}
        onDone={handleDone}
      />
    </>
  );
}
