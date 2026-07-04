"use client";

import * as React from "react";
import { AlertTriangle, Hash } from "lucide-react";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import {
  DOC_TYPE_LABEL,
  NUMBERING_BACKEND,
  type DocType,
  type Environment,
  type Numbering,
  type NumberingInput,
} from "@/features/dgii/numbering-store";
import {
  saveNumberingAnywhere,
  useNumberingHistory,
  HISTORY_ACTION_LABEL,
} from "@/features/dgii/numbering-client";
import { formatDateTime } from "@/lib/utils/format";

type Mode = "create" | "edit" | "view";

interface Props {
  open: boolean;
  mode: Mode;
  numbering?: Numbering;
  onClose: () => void;
}

// `produccion` se muestra pero BLOQUEADA: la emisión fiscal real está
// apagada (Fase G) y el servidor también la rechaza.
const ENVIRONMENTS: { value: Environment; label: string; disabled?: boolean }[] = [
  { value: "mock", label: "Mock (pruebas internas)" },
  { value: "demo", label: "Demo (no fiscal)" },
  { value: "testecf", label: "TesteCF (DGII pruebas)" },
  { value: "certecf", label: "CerteCF (DGII certificación)" },
  { value: "produccion", label: "Producción (BLOQUEADA — DGII real apagado)", disabled: true },
];

export function NumberingModal({ open, mode, numbering, onClose }: Props) {
  const toast = useToast();
  const readOnly = mode === "view";

  const [name, setName] = React.useState("");
  const [documentType, setDocumentType] = React.useState<DocType>("consumo");
  const [prefix, setPrefix] = React.useState("");
  const [rangeStart, setRangeStart] = React.useState("1");
  const [rangeEnd, setRangeEnd] = React.useState("");
  const [nextNumber, setNextNumber] = React.useState("1");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [environment, setEnvironment] = React.useState<Environment>("mock");
  const [isElectronic, setIsElectronic] = React.useState(false);
  const [isPreferred, setIsPreferred] = React.useState(false);
  const [status, setStatus] = React.useState<"active" | "inactive">("active");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    if (numbering) {
      setName(numbering.name);
      setDocumentType(numbering.documentType);
      setPrefix(numbering.prefix);
      setRangeStart(String(numbering.rangeStart));
      setRangeEnd(String(numbering.rangeEnd));
      setNextNumber(String(numbering.nextNumber));
      setStartDate(numbering.startDate ?? "");
      setEndDate(numbering.endDate ?? "");
      setEnvironment(numbering.environment);
      setIsElectronic(numbering.isElectronic);
      setIsPreferred(numbering.isPreferred);
      setStatus(numbering.status);
      setNote(numbering.note ?? "");
    } else {
      setName("");
      setDocumentType("consumo");
      setPrefix("");
      setRangeStart("1");
      setRangeEnd("");
      setNextNumber("1");
      setStartDate("");
      setEndDate("");
      setEnvironment("mock");
      setIsElectronic(false);
      setIsPreferred(false);
      setStatus("active");
      setNote("");
    }
    setError(null);
  }, [open, numbering]);

  const [saving, setSaving] = React.useState(false);

  if (!open) return null;

  const submit = async () => {
    const payload: NumberingInput = {
      name,
      documentType,
      prefix,
      rangeStart: Number(rangeStart),
      rangeEnd: Number(rangeEnd),
      nextNumber: Number(nextNumber),
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      environment,
      isElectronic,
      isPreferred,
      status,
      note: note || undefined,
    };
    setSaving(true);
    const res = await saveNumberingAnywhere(
      payload,
      mode === "edit" && numbering ? numbering.id : undefined,
    );
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast.success(mode === "edit" ? "Numeración actualizada." : "Numeración creada.");
    onClose();
  };

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
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--brand-primary)]/15 text-[color:var(--brand-accent)]">
            <Hash className="h-5 w-5" />
          </span>
          <h2 className="text-base font-semibold">
            {mode === "create"
              ? "Nueva numeración"
              : mode === "edit"
                ? "Editar numeración"
                : "Detalle de numeración"}
          </h2>
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Nombre *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} />
          </div>
          <div>
            <Label>Tipo de documento *</Label>
            <Select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value as DocType)}
              disabled={readOnly}
            >
              {(Object.keys(DOC_TYPE_LABEL) as DocType[]).map((t) => (
                <option key={t} value={t}>
                  {DOC_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Prefijo *</Label>
            <Input
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder="B02 / E32 / PROF"
              disabled={readOnly}
            />
          </div>
          <div>
            <Label>Rango inicial *</Label>
            <Input type="number" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} disabled={readOnly} />
          </div>
          <div>
            <Label>Rango final *</Label>
            <Input type="number" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} disabled={readOnly} />
          </div>
          <div>
            <Label>Siguiente número *</Label>
            <Input type="number" value={nextNumber} onChange={(e) => setNextNumber(e.target.value)} disabled={readOnly} />
          </div>
          <div>
            <Label>Ambiente</Label>
            <Select
              value={environment}
              onChange={(e) => setEnvironment(e.target.value as Environment)}
              disabled={readOnly}
            >
              {ENVIRONMENTS.map((e) => (
                <option key={e.value} value={e.value} disabled={e.disabled}>
                  {e.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Fecha de inicio</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={readOnly} />
          </div>
          <div>
            <Label>Fecha de finalización</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={readOnly} />
          </div>
          <div>
            <Label>Estado</Label>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as "active" | "inactive")}
              disabled={readOnly}
            >
              <option value="active">Activa</option>
              <option value="inactive">Inactiva</option>
            </Select>
          </div>
          <div className="flex items-end gap-4 pb-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={isElectronic}
                onChange={(e) => setIsElectronic(e.target.checked)}
                disabled={readOnly}
              />
              Electrónica (e-CF)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={isPreferred}
                onChange={(e) => setIsPreferred(e.target.checked)}
                disabled={readOnly}
              />
              Preferida
            </label>
          </div>
          <div className="sm:col-span-2">
            <Label>Nota interna</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} disabled={readOnly} />
          </div>
        </div>

        {readOnly && numbering && (
          <div className="mt-3 rounded-lg border border-black/10 bg-black/[0.02] p-3 text-xs">
            <div className="mb-1 font-medium">Uso</div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 opacity-80">
              <span>
                Consumidos:{" "}
                <strong>
                  {Math.max(0, numbering.nextNumber - numbering.rangeStart)}
                </strong>
              </span>
              <span>
                Disponibles:{" "}
                <strong>
                  {Math.max(0, numbering.rangeEnd - numbering.nextNumber + 1)}
                </strong>
              </span>
              <span>
                Próximo: <strong>{numbering.nextNumber}</strong>
              </span>
            </div>
            {NUMBERING_BACKEND === "supabase" ? (
              <NumberingHistory numberingId={numbering.id} />
            ) : (
              <p className="mt-1 opacity-60">
                El historial detallado está disponible en modo servidor
                (Supabase).
              </p>
            )}
          </div>
        )}

        {isElectronic && environment !== "mock" && environment !== "demo" && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Las numeraciones e-CF reales requieren postulación DGII aprobada,
            certificado válido y rango autorizado. Este módulo NO envía a DGII.
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {readOnly ? "Cerrar" : "Cancelar"}
          </Button>
          {!readOnly && (
            <Button type="button" size="sm" onClick={submit} disabled={saving}>
              {saving
                ? "Guardando…"
                : mode === "edit"
                  ? "Guardar cambios"
                  : "Crear numeración"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Historial de auditoría de la numeración (creación/edición/reservas). */
function NumberingHistory({ numberingId }: { numberingId: string }) {
  const { history, loading } = useNumberingHistory(numberingId);
  if (loading) return <p className="mt-2 opacity-60">Cargando historial…</p>;
  if (history.length === 0) {
    return <p className="mt-2 opacity-60">Sin movimientos registrados todavía.</p>;
  }
  return (
    <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
      {history.map((h, i) => (
        <div
          key={i}
          className="flex flex-wrap items-baseline gap-x-2 border-b border-black/5 py-1 last:border-0"
        >
          <span className="font-medium">
            {HISTORY_ACTION_LABEL[h.action] ?? h.action}
          </span>
          {h.action === "dgii.sequence_reserved" &&
            typeof h.metadata?.formatted === "string" && (
              <span className="font-mono">{h.metadata.formatted}</span>
            )}
          <span className="opacity-60">
            {h.userName || "—"} · {formatDateTime(h.createdAt)}
          </span>
        </div>
      ))}
    </div>
  );
}
