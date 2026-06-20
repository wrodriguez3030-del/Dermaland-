"use client";

import * as React from "react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Select,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { FilterBar } from "@/components/ui/filter-bar";
import { RowActions } from "@/components/ui/row-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import {
  AlertTriangle,
  Clock,
  Hash,
  Plus,
  Power,
  RotateCcw,
  Star,
} from "lucide-react";
import { formatDate } from "@/lib/utils/format";
import {
  useNumberings,
  deleteNumbering,
  setNumberingActive,
  setPreferred,
  effectiveStatus,
  remaining,
  isLowRange,
  DOC_TYPE_LABEL,
  type DocType,
  type Numbering,
} from "@/features/dgii/numbering-store";
import { NumberingModal } from "@/features/dgii/numbering-modal";

const envTone: Record<string, "success" | "info" | "warning" | "neutral"> = {
  produccion: "success",
  certecf: "info",
  testecf: "warning",
  demo: "neutral",
  mock: "neutral",
};
const statusBadge = (n: Numbering) => {
  const st = effectiveStatus(n);
  if (st === "active") return <Badge tone="success">Activa</Badge>;
  if (st === "inactive") return <Badge tone="neutral">Inactiva</Badge>;
  if (st === "exhausted") return <Badge tone="danger">Agotada</Badge>;
  return <Badge tone="danger">Vencida</Badge>;
};

export default function NumeracionesPage() {
  const numberings = useNumberings();
  const toast = useToast();
  const [docFilter, setDocFilter] = React.useState<"all" | DocType>("all");
  const [modal, setModal] = React.useState<{
    open: boolean;
    mode: "create" | "edit" | "view";
    numbering?: Numbering;
  }>({ open: false, mode: "create" });

  const rows = numberings.filter(
    (n) => docFilter === "all" || n.documentType === docFilter,
  );

  const lowOnes = numberings.filter(isLowRange);
  const expiredOnes = numberings.filter((n) => effectiveStatus(n) === "expired");

  return (
    <>
      <PageHeader
        title="Numeraciones de comprobantes"
        description="Administra las numeraciones de los comprobantes que generas en tu negocio."
        breadcrumbs={[{ label: "DGII", href: "/dgii" }, { label: "Numeraciones" }]}
        actions={
          <Button
            size="sm"
            onClick={() => setModal({ open: true, mode: "create" })}
          >
            <Plus className="h-4 w-4" /> Nueva numeración
          </Button>
        }
      />

      <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
          <div>
            <strong>Las numeraciones e-CF reales no se emiten desde aquí.</strong>{" "}
            Los ambientes <code>testecf/certecf/producción</code> requieren
            postulación DGII, certificado y rango autorizado. Los ambientes{" "}
            <code>mock/demo</code> nunca consumen secuencia fiscal real.
          </div>
        </div>
      </div>

      {(lowOnes.length > 0 || expiredOnes.length > 0) && (
        <div className="mb-4 space-y-2">
          {lowOnes.map((n) => (
            <div
              key={`low-${n.id}`}
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
            >
              <strong>{n.name}</strong>: está por agotarse ({remaining(n)}{" "}
              números restantes).
            </div>
          ))}
          {expiredOnes.map((n) => (
            <div
              key={`exp-${n.id}`}
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900"
            >
              <strong>{n.name}</strong>: está vencida y no puede usarse para
              emitir.
            </div>
          ))}
        </div>
      )}

      <FilterBar className="mb-4">
        <Select
          value={docFilter}
          onChange={(e) => setDocFilter(e.target.value as "all" | DocType)}
        >
          <option value="all">Todos los tipos de documento</option>
          {(Object.keys(DOC_TYPE_LABEL) as DocType[]).map((t) => (
            <option key={t} value={t}>
              {DOC_TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState
          icon={Hash}
          title="No tienes numeraciones configuradas"
          description="Crea una numeración para comenzar a emitir comprobantes."
          action={
            <Button size="sm" onClick={() => setModal({ open: true, mode: "create" })}>
              <Plus className="h-4 w-4" /> Nueva numeración
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Nombre</TH>
                  <TH>Preferida</TH>
                  <TH>Electrónica</TH>
                  <TH>Vence</TH>
                  <TH>Prefijo</TH>
                  <TH className="text-right">Inicio</TH>
                  <TH className="text-right">Fin</TH>
                  <TH className="text-right">Siguiente</TH>
                  <TH>Ambiente</TH>
                  <TH>Estado</TH>
                  <TH className="text-right pr-4">Acciones</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((n) => {
                  const active = effectiveStatus(n) === "active";
                  const low = isLowRange(n);
                  return (
                    <TR key={n.id}>
                      <TD>
                        <div className="font-medium">{n.name}</div>
                        <div className="text-xs opacity-60">
                          {DOC_TYPE_LABEL[n.documentType]}
                        </div>
                      </TD>
                      <TD>
                        {n.isPreferred ? (
                          <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                        ) : (
                          <span className="opacity-30">—</span>
                        )}
                      </TD>
                      <TD>
                        {n.isElectronic ? (
                          <Badge tone="info">e-CF</Badge>
                        ) : (
                          <span className="text-xs opacity-50">No</span>
                        )}
                      </TD>
                      <TD className="text-xs">
                        {n.endDate ? formatDate(n.endDate) : "—"}
                      </TD>
                      <TD className="font-mono text-xs">{n.prefix}</TD>
                      <TD className="text-right tabular-nums">{n.rangeStart}</TD>
                      <TD className="text-right tabular-nums">{n.rangeEnd}</TD>
                      <TD className="text-right tabular-nums font-medium">
                        {n.nextNumber}
                        {low && (
                          <span className="ml-1 text-[10px] text-amber-700">
                            ({remaining(n)})
                          </span>
                        )}
                      </TD>
                      <TD>
                        <Badge tone={envTone[n.environment] ?? "neutral"}>
                          {n.environment}
                        </Badge>
                      </TD>
                      <TD>{statusBadge(n)}</TD>
                      <TD className="pr-4">
                        <RowActions
                          onView={() =>
                            setModal({ open: true, mode: "view", numbering: n })
                          }
                          onEdit={() =>
                            setModal({ open: true, mode: "edit", numbering: n })
                          }
                          onDelete={() => {
                            const res = deleteNumbering(n.id);
                            if (!res.ok) toast.error(res.error);
                            else toast.success("Numeración eliminada.");
                          }}
                          entityName={n.name}
                          customActions={[
                            {
                              label: "Historial / uso",
                              icon: Clock,
                              onClick: () =>
                                setModal({ open: true, mode: "view", numbering: n }),
                            },
                            ...(!n.isPreferred && active
                              ? [
                                  {
                                    label: "Marcar preferida",
                                    icon: Star,
                                    onClick: () => {
                                      setPreferred(n.id);
                                      toast.success(
                                        `${n.name} marcada como preferida.`,
                                      );
                                    },
                                  },
                                ]
                              : []),
                            n.status === "active"
                              ? {
                                  label: "Inactivar",
                                  icon: Power,
                                  onClick: () => {
                                    setNumberingActive(n.id, false);
                                    toast.success(`${n.name} inactivada.`);
                                  },
                                  confirm: {
                                    title: "Inactivar numeración",
                                    message: `¿Inactivar ${n.name}? No podrá usarse para emitir.`,
                                  },
                                }
                              : {
                                  label: "Activar",
                                  icon: RotateCcw,
                                  onClick: () => {
                                    setNumberingActive(n.id, true);
                                    toast.success(`${n.name} activada.`);
                                  },
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
      )}

      <NumberingModal
        open={modal.open}
        mode={modal.mode}
        numbering={modal.numbering}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
      />
      <toast.Toast />
    </>
  );
}
