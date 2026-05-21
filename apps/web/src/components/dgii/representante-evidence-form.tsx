"use client";

import * as React from "react";
import { Check, Square, MinusCircle, FileText } from "lucide-react";
import { Badge, Input, Textarea, Label, Button } from "@/components/ui";
import {
  setChecklistItemEvidence,
  setDeclarationAccepted,
  type EnablementProgress,
  type ChecklistItemEvidence,
} from "@/features/dgii/enablement-store";
import type { EnablementStepDef } from "@/lib/mock-data/dgii-enablement";

interface RepresentanteEvidenceFormProps {
  step: EnablementStepDef;
  progress?: EnablementProgress;
}

/**
 * Formulario rico de evidencia para el paso
 * `autorizacion_representante` del wizard SaaS DGII. Cada ítem del
 * checklist se confirma individualmente con:
 *
 *   - status: confirmed | pending | not_applicable
 *   - nota libre
 *   - fecha de confirmación (auto-fill al confirmar)
 *   - responsable (texto libre — contador, admin, dueño)
 *   - referencia documental opcional
 *
 * Al pie, el responsable acepta una declaración formal. Sin la
 * declaración aceptada Y los 9 ítems confirmados, el evaluador NO
 * marca el paso como `completed` — bloqueando `ready_for_testecf`.
 *
 * No se llama a DGII. No se envía nada. Solo persiste localmente en
 * `enablement-store` (localStorage). Producción: migrar a tabla
 * Supabase `dgii_enablement_evidence` con RLS por business_id.
 */
export function RepresentanteEvidenceForm({
  step,
  progress,
}: RepresentanteEvidenceFormProps) {
  const items = step.checklist;
  const confirmedCount = items.filter(
    (it) => getEvidence(progress, it.id)?.status === "confirmed",
  ).length;
  const naCount = items.filter(
    (it) => getEvidence(progress, it.id)?.status === "not_applicable",
  ).length;
  const totalCount = items.length;
  const remaining = totalCount - confirmedCount - naCount;
  const declarationAccepted = progress?.declarationAccepted === true;
  const allConfirmed = remaining === 0;
  const canComplete = allConfirmed && declarationAccepted;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-black/5 bg-black/[0.02] p-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={canComplete ? "success" : remaining === 0 ? "warning" : "info"}>
            {confirmedCount + naCount} de {totalCount} ítems registrados
          </Badge>
          {remaining > 0 && (
            <span className="opacity-70">{remaining} pendiente(s)</span>
          )}
          {declarationAccepted ? (
            <Badge tone="success">declaración aceptada</Badge>
          ) : (
            <Badge tone="warning">declaración pendiente</Badge>
          )}
        </div>
        <p className="mt-2 opacity-70">
          Confirmá cada ítem con nombre del responsable, fecha y, si
          aplica, referencia documental (acta, código de archivo,
          enlace al expediente). Los datos quedan localmente en tu
          equipo y se pueden auditar después.
        </p>
      </div>

      <ul className="space-y-3">
        {items.map((it) => (
          <EvidenceItemRow
            key={it.id}
            stepId={step.id}
            itemId={it.id}
            itemLabel={it.label}
            current={getEvidence(progress, it.id)}
          />
        ))}
      </ul>

      <div
        className={`rounded-xl border p-3 text-sm ${
          declarationAccepted
            ? "border-emerald-300 bg-emerald-50 text-emerald-950"
            : "border-amber-300 bg-amber-50 text-amber-950"
        }`}
      >
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={declarationAccepted}
            onChange={(e) =>
              setDeclarationAccepted(step.id, e.target.checked)
            }
            className="mt-1 h-4 w-4 shrink-0"
            aria-label="Aceptar declaración final del representante e-CF"
          />
          <span className="text-xs leading-relaxed">
            <strong>Declaración formal del responsable.</strong> Confirmo
            que el titular del certificado digital está designado como
            <em> Usuario Administrador e-CF </em> del contribuyente o es
            su representante autorizado para firmar e-CF ante la DGII,
            según el RNC declarado en la configuración fiscal. Entiendo
            que esta confirmación es responsabilidad mía / del contador
            y que DermaLand no certifica esta relación ante DGII — la
            validación final corre por mi cuenta.
            {progress?.declarationAcceptedAt && (
              <span className="mt-1 block text-[11px] opacity-70">
                Aceptada el{" "}
                {new Date(progress.declarationAcceptedAt).toLocaleString(
                  "es-DO",
                )}
              </span>
            )}
          </span>
        </label>
      </div>

      {!canComplete && (
        <p className="text-xs opacity-70">
          <strong>Bloqueo:</strong>{" "}
          {remaining > 0
            ? `faltan ${remaining} ítem(s) de evidencia por registrar`
            : "falta aceptar la declaración formal"}
          {". "}Hasta entonces, este paso no se marcará como completado
          y el envío a DGII testecf permanece bloqueado.
        </p>
      )}
    </div>
  );
}

function getEvidence(
  progress: EnablementProgress | undefined,
  itemId: string,
): ChecklistItemEvidence | undefined {
  return progress?.checklist.find((c) => c.id === itemId)?.evidence;
}

interface EvidenceItemRowProps {
  stepId: EnablementStepDef["id"];
  itemId: string;
  itemLabel: string;
  current?: ChecklistItemEvidence;
}

function EvidenceItemRow({
  stepId,
  itemId,
  itemLabel,
  current,
}: EvidenceItemRowProps) {
  const [expanded, setExpanded] = React.useState(false);
  const status = current?.status ?? "pending";

  const update = (next: Partial<ChecklistItemEvidence>) => {
    setChecklistItemEvidence(stepId, itemId, itemLabel, {
      status: current?.status ?? "pending",
      note: current?.note,
      confirmedAt: current?.confirmedAt,
      responsible: current?.responsible,
      documentRef: current?.documentRef,
      ...next,
    });
  };

  const tone =
    status === "confirmed"
      ? "border-emerald-300 bg-emerald-50/40"
      : status === "not_applicable"
        ? "border-slate-300 bg-slate-50"
        : "border-amber-200 bg-amber-50/30";

  const StatusIcon =
    status === "confirmed" ? Check : status === "not_applicable" ? MinusCircle : Square;

  return (
    <li className={`rounded-xl border ${tone} p-3`}>
      <div className="flex items-start gap-3">
        <StatusIcon
          className={`mt-0.5 h-4 w-4 shrink-0 ${
            status === "confirmed"
              ? "text-emerald-600"
              : status === "not_applicable"
                ? "text-slate-500"
                : "opacity-50"
          }`}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-left text-sm font-medium hover:underline"
            aria-expanded={expanded}
          >
            {itemLabel}
          </button>
          {!expanded && current && (
            <p className="mt-1 text-[11px] opacity-60">
              {current.responsible ? `Responsable: ${current.responsible}` : null}
              {current.confirmedAt
                ? ` · Confirmado: ${new Date(current.confirmedAt).toLocaleDateString("es-DO")}`
                : null}
              {current.documentRef ? ` · Ref: ${current.documentRef}` : null}
              {current.note ? ` · "${current.note.slice(0, 80)}${current.note.length > 80 ? "…" : ""}"` : null}
            </p>
          )}
          {expanded && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor={`${itemId}-status`}>Estado del ítem</Label>
                <div className="mt-1 flex flex-wrap gap-2">
                  <StatusButton
                    label="Confirmado"
                    selected={status === "confirmed"}
                    onClick={() => update({ status: "confirmed" })}
                    tone="success"
                  />
                  <StatusButton
                    label="Pendiente"
                    selected={status === "pending"}
                    onClick={() =>
                      update({ status: "pending", confirmedAt: undefined })
                    }
                    tone="warning"
                  />
                  <StatusButton
                    label="No aplica"
                    selected={status === "not_applicable"}
                    onClick={() => update({ status: "not_applicable" })}
                    tone="neutral"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor={`${itemId}-responsible`}>
                  Responsable que confirma
                </Label>
                <Input
                  id={`${itemId}-responsible`}
                  placeholder="ej. Juan Pérez (contador)"
                  value={current?.responsible ?? ""}
                  onChange={(e) => update({ responsible: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor={`${itemId}-date`}>Fecha de confirmación</Label>
                <Input
                  id={`${itemId}-date`}
                  type="date"
                  value={
                    current?.confirmedAt
                      ? current.confirmedAt.slice(0, 10)
                      : ""
                  }
                  onChange={(e) =>
                    update({
                      confirmedAt: e.target.value
                        ? new Date(e.target.value).toISOString()
                        : undefined,
                    })
                  }
                />
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor={`${itemId}-docref`}>
                  Referencia documental (opcional)
                </Label>
                <Input
                  id={`${itemId}-docref`}
                  placeholder="ej. Acta N°2026-031 · Drive/contratos/cert-titular.pdf"
                  value={current?.documentRef ?? ""}
                  onChange={(e) => update({ documentRef: e.target.value })}
                />
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor={`${itemId}-note`}>Nota / observación</Label>
                <Textarea
                  id={`${itemId}-note`}
                  placeholder="Detalles adicionales para auditoría futura"
                  value={current?.note ?? ""}
                  onChange={(e) => update({ note: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="sm:col-span-2 flex justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setExpanded(false)}
                >
                  <FileText className="h-4 w-4" />
                  Cerrar ítem
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function StatusButton({
  label,
  selected,
  onClick,
  tone,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  tone: "success" | "warning" | "neutral";
}) {
  const toneClasses = selected
    ? tone === "success"
      ? "border-emerald-500 bg-emerald-100 text-emerald-900"
      : tone === "warning"
        ? "border-amber-500 bg-amber-100 text-amber-900"
        : "border-slate-500 bg-slate-100 text-slate-900"
    : "border-black/10 hover:border-black/30";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs ${toneClasses}`}
      aria-pressed={selected}
    >
      {label}
    </button>
  );
}
