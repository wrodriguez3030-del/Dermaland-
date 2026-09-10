"use client";

import * as React from "react";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, Button, Card, CardContent } from "@/components/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SearchInput } from "@/components/ui/search-input";
import { useToast } from "@/components/ui/toast";
import type { Customer } from "@/types";
import { coincideCliente } from "@/features/customers/customer-search";
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
function sobrevivientePorDefecto(par: DuplicatePairDto): string {
  return par.b.totalOrders > par.a.totalOrders ? par.b.id : par.a.id;
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

function ClientCheckbox({
  cliente,
  seleccionado,
  onSeleccionar,
}: {
  cliente: Customer;
  seleccionado: boolean;
  onSeleccionar: () => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
        seleccionado
          ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]/5"
          : "border-black/10"
      }`}
    >
      <input type="checkbox" checked={seleccionado} onChange={onSeleccionar} />
      <span>
        <span className="font-medium">{nombreCompleto(cliente)}</span>{" "}
        <span className="opacity-60">· {cliente.totalOrders} compras</span>
      </span>
    </label>
  );
}

function PairRow({ par, onDone }: { par: DuplicatePairDto; onDone: () => void }) {
  const toast = useToast();
  const [survivorId, setSurvivorId] = React.useState(() => sobrevivientePorDefecto(par));
  const [calculando, setCalculando] = React.useState(false);
  const [impacto, setImpacto] = React.useState<MergeImpact[] | null>(null);
  const [confirmando, setConfirmando] = React.useState(false);
  const [fusionando, setFusionando] = React.useState(false);

  const survivor = survivorId === par.a.id ? par.a : par.b;
  const loser = survivorId === par.a.id ? par.b : par.a;

  const iniciarUnificacion = async () => {
    setCalculando(true);
    const r = await mergeCustomersDryRun(survivor.id, loser.id);
    setCalculando(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setImpacto(r.moved);
    setConfirmando(true);
  };

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
      <toast.Toast />
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <ClientCheckbox
            cliente={par.a}
            seleccionado={survivorId === par.a.id}
            onSeleccionar={() => setSurvivorId(par.a.id)}
          />
          <ClientCheckbox
            cliente={par.b}
            seleccionado={survivorId === par.b.id}
            onSeleccionar={() => setSurvivorId(par.b.id)}
          />
          <Badge tone={CONFIDENCE_TONE[par.confidence]}>{CONFIDENCE_LABEL[par.confidence]}</Badge>
          <span className="text-sm opacity-60">Coincide por: {par.reasons.join(", ")}</span>
        </div>
        <Button size="sm" disabled={calculando} onClick={iniciarUnificacion}>
          {calculando ? "Calculando…" : "Unificar"}
        </Button>
      </CardContent>

      <ConfirmDialog
        open={confirmando}
        title="Unificar clientes"
        message={
          <>
            <strong>{nombreCompleto(loser)}</strong> se traspasa a <strong>{nombreCompleto(survivor)}</strong> y
            queda eliminado.
            <div className="mt-2">{impacto ? describeMergeImpact(impacto) : "—"}</div>
          </>
        }
        confirmLabel={fusionando ? "Unificando…" : "Confirmar unificación"}
        onConfirm={confirmarFusion}
        onCancel={() => setConfirmando(false)}
      />
    </Card>
  );
}

export function MergeClientsView() {
  const [pairs, setPairs] = React.useState<DuplicatePairDto[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busqueda, setBusqueda] = React.useState("");

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
  };

  const filtrados = React.useMemo(() => {
    if (!pairs) return [];
    if (!busqueda.trim()) return pairs;
    return pairs.filter((p) => coincideCliente(p.a, busqueda) || coincideCliente(p.b, busqueda));
  }, [pairs, busqueda]);

  const pagination = usePagination(filtrados, { resetKey: busqueda });

  return (
    <>
      <PageHeader
        title="Unificar clientes"
        description="Posibles duplicados detectados en toda la base — marca quién recibe y unifica."
        breadcrumbs={[{ label: "Clientes", href: "/clientes" }, { label: "Unificar" }]}
      />

      {error && <div className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {pairs === null && !error && <p className="opacity-70">Escaneando la base…</p>}

      {pairs !== null && pairs.length > 0 && (
        <SearchInput
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, documento, teléfono…"
          containerClassName="mb-4 max-w-md"
        />
      )}

      {pairs !== null && pairs.length === 0 && (
        <EmptyState icon={Users} title="No se encontraron posibles duplicados" />
      )}

      {pairs !== null && pairs.length > 0 && filtrados.length === 0 && (
        <EmptyState icon={Users} title="Ningún par coincide con tu búsqueda" />
      )}

      <div className="space-y-3">
        {pagination.pageItems.map((par) => {
          const key = parKey(par);
          return <PairRow key={key} par={par} onDone={() => quitarPar(key)} />;
        })}
      </div>

      {filtrados.length > 0 && (
        <DataPagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={pagination.total}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          className="mt-4"
        />
      )}
    </>
  );
}
