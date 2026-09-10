"use client";

import * as React from "react";
import { Users, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, Button, Card, CardContent } from "@/components/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import type { Customer } from "@/types";
import {
  fetchDuplicatePairs,
  mergeCustomersDryRun,
  mergeCustomers,
  describeMergeImpact,
  type DuplicatePairDto,
} from "@/features/customers/customer-merge-client";
import type { MergeImpact } from "@/server/services/customers/merge-clients";

const nombreCompleto = (c: Customer) => `${c.firstName} ${c.lastName}`.trim();

/** Preselección: el que tiene más compras registradas; empate → el primero. */
function sobrevivientePorDefecto(par: DuplicatePairDto): Customer {
  return par.b.totalOrders > par.a.totalOrders ? par.b : par.a;
}

const CONFIDENCE_LABEL: Record<DuplicatePairDto["confidence"], string> = {
  high: "Alta",
  medium: "Media",
  low: "Baja",
};
const CONFIDENCE_TONE: Record<DuplicatePairDto["confidence"], "danger" | "warning" | "neutral"> = {
  high: "danger",
  medium: "warning",
  low: "neutral",
};

function PairDetail({
  par,
  onDone,
  onCancel,
}: {
  par: DuplicatePairDto;
  onDone: () => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [survivorId, setSurvivorId] = React.useState(sobrevivientePorDefecto(par).id);
  const [impacto, setImpacto] = React.useState<MergeImpact[] | null>(null);
  const [cargandoImpacto, setCargandoImpacto] = React.useState(true);
  const [confirmando, setConfirmando] = React.useState(false);
  const [fusionando, setFusionando] = React.useState(false);

  const survivor = survivorId === par.a.id ? par.a : par.b;
  const loser = survivorId === par.a.id ? par.b : par.a;

  React.useEffect(() => {
    let vivo = true;
    setCargandoImpacto(true);
    mergeCustomersDryRun(survivor.id, loser.id).then((r) => {
      if (!vivo) return;
      setCargandoImpacto(false);
      if (r.ok) setImpacto(r.moved);
      else toast.error(r.error);
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [survivor.id, loser.id]);

  const confirmarFusion = async () => {
    setFusionando(true);
    const r = await mergeCustomers(survivor.id, loser.id);
    setFusionando(false);
    setConfirmando(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(`Clientes unificados. ${nombreCompleto(loser)} pasó a ${nombreCompleto(survivor)}.`);
    onDone();
  };

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {[par.a, par.b].map((c) => (
            <label
              key={c.id}
              className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-3 text-sm ${
                survivorId === c.id
                  ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]/5"
                  : "border-black/10"
              }`}
            >
              <span className="flex items-center gap-2 font-medium">
                <input
                  type="radio"
                  name={`survivor-${par.a.id}-${par.b.id}`}
                  checked={survivorId === c.id}
                  onChange={() => setSurvivorId(c.id)}
                />
                {nombreCompleto(c)} {survivorId === c.id && <Badge tone="success">Sobrevive</Badge>}
              </span>
              <span className="opacity-70">Documento: {c.documentNumber || "—"}</span>
              <span className="opacity-70">
                Teléfono: {c.phone || "—"} · WhatsApp: {c.whatsapp || "—"}
              </span>
              <span className="opacity-70">Email: {c.email || "—"}</span>
              <span className="opacity-70">Compras: {c.totalOrders}</span>
            </label>
          ))}
        </div>

        <div className="rounded-lg bg-black/[0.03] p-3 text-sm">
          {cargandoImpacto ? "Calculando cuánto se mueve…" : impacto ? describeMergeImpact(impacto) : "—"}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
          <Button size="sm" disabled={cargandoImpacto} onClick={() => setConfirmando(true)}>
            Unificar
          </Button>
        </div>
      </CardContent>

      <ConfirmDialog
        open={confirmando}
        title="Unificar clientes"
        message={
          <>
            <strong>{nombreCompleto(loser)}</strong> se traspasa a <strong>{nombreCompleto(survivor)}</strong> y
            queda eliminado.
            {impacto && <div className="mt-2">{describeMergeImpact(impacto)}</div>}
          </>
        }
        confirmLabel={fusionando ? "Unificando…" : "Unificar"}
        onConfirm={confirmarFusion}
        onCancel={() => setConfirmando(false)}
      />
    </Card>
  );
}

export function MergeClientsView() {
  const toast = useToast();
  const [pairs, setPairs] = React.useState<DuplicatePairDto[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [abierto, setAbierto] = React.useState<string | null>(null);

  const cargar = React.useCallback(async () => {
    setError(null);
    const r = await fetchDuplicatePairs();
    if (r.ok) setPairs(r.pairs);
    else setError(r.error);
  }, []);

  React.useEffect(() => {
    cargar();
  }, [cargar]);

  const parKey = (p: DuplicatePairDto) => `${p.a.id}|${p.b.id}`;

  const quitarPar = (key: string) => {
    setPairs((prev) => (prev ?? []).filter((p) => parKey(p) !== key));
    setAbierto(null);
  };

  return (
    <>
      <PageHeader
        title="Unificar clientes"
        description="Posibles duplicados detectados en toda la base — comparar y fusionar de a un par."
        breadcrumbs={[{ label: "Clientes", href: "/clientes" }, { label: "Unificar" }]}
      />
      <toast.Toast />

      {error && <div className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {pairs === null && !error && <p className="opacity-70">Escaneando la base…</p>}

      {pairs !== null && pairs.length === 0 && (
        <EmptyState icon={Users} title="No se encontraron posibles duplicados" />
      )}

      <div className="space-y-3">
        {(pairs ?? []).map((par) => {
          const key = parKey(par);
          return (
            <div key={key}>
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{nombreCompleto(par.a)}</span>
                    <ArrowRight className="h-4 w-4 opacity-40" />
                    <span className="font-medium">{nombreCompleto(par.b)}</span>
                    <Badge tone={CONFIDENCE_TONE[par.confidence]}>{CONFIDENCE_LABEL[par.confidence]}</Badge>
                    <span className="opacity-60">Coincide por: {par.reasons.join(", ")}</span>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setAbierto(abierto === key ? null : key)}>
                    Comparar
                  </Button>
                </CardContent>
              </Card>
              {abierto === key && (
                <div className="mt-2">
                  <PairDetail par={par} onDone={() => quitarPar(key)} onCancel={() => setAbierto(null)} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
