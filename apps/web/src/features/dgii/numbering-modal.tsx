"use client";

import * as React from "react";
import { AlertTriangle, Hash } from "lucide-react";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import {
  createNumbering,
  updateNumbering,
  DOC_TYPE_LABEL,
  type DocType,
  type Environment,
  type Numbering,
  type NumberingInput,
} from "@/features/dgii/numbering-store";

type Mode = "create" | "edit" | "view";

interface Props {
  open: boolean;
  mode: Mode;
  numbering?: Numbering;
  onClose: () => void;
}

const ENVIRONMENTS: { value: Environment; label: string }[] = [
  { value: "mock", label: "Mock (pruebas internas)" },
  { value: "demo", label: "Demo (no fiscal)" },
  { value: "testecf", label: "TesteCF (DGII pruebas)" },
  { value: "certecf", label: "CerteCF (DGII certificación)" },
  { value: "produccion", label: "Producción (fiscal)" },
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

  if (!open) return null;

  const submit = () => {
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
    const res =
      mode === "edit" && numbering
        ? updateNumbering(numbering.id, payload)
        : createNumbering(payload);
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
                <option key={e.value} value={e.value}>
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
            <p className="mt-1 opacity-60">
              El historial detallado de documentos aparecerá al vincularse
              comprobantes a esta numeración.
            </p>
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
            <Button type="button" size="sm" onClick={submit}>
              {mode === "edit" ? "Guardar cambios" : "Crear numeración"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
