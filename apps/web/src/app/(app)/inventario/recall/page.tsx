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
} from "@/components/ui";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { RowActions } from "@/components/ui/row-actions";
import { Megaphone, MessageCircle, Copy, FileText, Users } from "lucide-react";
import { useProducts } from "@/features/products/product-store";
import { useAllLots } from "@/features/inventory/lot-store";
import { BranchFilter, branchMatches, ALL_BRANCHES } from "@/features/tenancy/branch-filter";
import { formatDate } from "@/lib/utils/format";
import { downloadBlob } from "@/lib/utils/download";
import { lotStatusBadge } from "@/features/inventory/lot-badges";
import type { LotBuyer } from "@/features/inventory/lot-buyers";
import type { ProductLot } from "@/types";

/** Número dominicano → formato wa.me (dígitos, con código de país 1). */
function toWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10 && /^[89]/.test(digits)) return `1${digits}`;
  return digits;
}

function recallMessage(clientName: string, productName: string, lotNumber: string): string {
  return (
    `Estimado/a ${clientName}, le informamos que el lote ${lotNumber} del producto ` +
    `${productName} fue retirado del mercado (recall). Por favor no lo utilice y ` +
    `contáctenos para coordinar el cambio o la devolución. Gracias.`
  );
}

// ─── Modal: notificar clientes ───────────────────────────────────────────────

function NotifyClientsModal({
  lot,
  productName,
  onClose,
}: {
  lot: ProductLot;
  productName: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [buyers, setBuyers] = React.useState<LotBuyer[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    fetch(`/api/lots/${lot.id}/buyers`, { cache: "no-store" })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
        if (alive) setBuyers(body.buyers as LotBuyer[]);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "No se pudo cargar la lista.");
      });
    return () => {
      alive = false;
    };
  }, [lot.id]);

  const copyList = async () => {
    if (!buyers?.length) return;
    const text = buyers
      .map(
        (b) =>
          `${b.customerName}\t${b.phone || "sin teléfono"}\t${b.totalQuantity} u.\túltima ${formatDate(b.lastPurchase)}`,
      )
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Lista copiada al portapapeles.");
    } catch {
      toast.error("No se pudo copiar.");
    }
  };

  const exportCsv = () => {
    if (!buyers?.length) return;
    const header = "Cliente,Telefono,Cantidad,Compras,Ultima compra\n";
    const body = buyers
      .map(
        (b) =>
          `"${b.customerName.replace(/"/g, '""')}","${b.phone}",${b.totalQuantity},${b.purchaseCount},${b.lastPurchase.slice(0, 10)}`,
      )
      .join("\n");
    downloadBlob(
      `recall-clientes-${lot.lotNumber}.csv`,
      new TextEncoder().encode(header + body),
      "text/csv;charset=utf-8",
    );
  };

  return (
    <>
    <Modal
      open
      title={`Clientes que compraron el lote ${lot.lotNumber}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={copyList} disabled={!buyers?.length}>
            <Copy className="h-4 w-4" /> Copiar lista
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!buyers?.length}>
            <FileText className="h-4 w-4" /> Exportar CSV
          </Button>
          <Button size="sm" onClick={onClose}>Cerrar</Button>
        </>
      }
    >
      <p className="mb-3 text-xs opacity-70">{productName}</p>
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
          {error}
        </div>
      )}
      {!error && buyers === null && (
        <div className="py-8 text-center text-sm opacity-60">Cargando clientes…</div>
      )}
      {!error && buyers !== null && buyers.length === 0 && (
        <div className="py-8 text-center text-sm opacity-60">
          Nadie compró este lote todavía.
        </div>
      )}
      {buyers && buyers.length > 0 && (
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>Cliente</TH>
                <TH>Teléfono</TH>
                <TH className="text-right">Cantidad</TH>
                <TH>Última compra</TH>
                <TH className="text-right pr-2">Contactar</TH>
              </TR>
            </THead>
            <TBody>
              {buyers.map((b) => {
                const wa = toWhatsAppNumber(b.phone);
                return (
                  <TR key={b.customerId}>
                    <TD className="text-sm font-medium">{b.customerName}</TD>
                    <TD className="text-xs opacity-70">{b.phone || "—"}</TD>
                    <TD className="text-right tabular-nums">{b.totalQuantity}</TD>
                    <TD className="text-xs">{formatDate(b.lastPurchase)}</TD>
                    <TD className="pr-2">
                      <RowActions
                        canView={false}
                        canEdit={false}
                        canDelete={false}
                        customActions={[
                          wa
                            ? {
                                label: "Enviar WhatsApp",
                                icon: MessageCircle,
                                href: `https://wa.me/${wa}?text=${encodeURIComponent(recallMessage(b.customerName, productName, lot.lotNumber))}`,
                                external: true,
                              }
                            : {
                                label: "WhatsApp",
                                icon: MessageCircle,
                                disabled: true,
                                disabledReason:
                                  "Este cliente no tiene teléfono registrado.",
                              },
                        ]}
                      />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </div>
      )}
    </Modal>
    <toast.Toast />
    </>
  );
}

export default function RecallPage() {
  // Lotes REALES (Supabase o local según DATA_SOURCE); el estado `recalled`
  // se cambia en runtime desde Cuarentena — antes se leía el seed estático
  // y la lista salía vacía en producción.
  const allLots = useAllLots();
  const [branchFilter, setBranchFilter] = React.useState(ALL_BRANCHES);
  const lots = allLots.filter(
    (l) => l.status === "recalled" && branchMatches(l.branchId, branchFilter),
  );
  const products = useProducts();
  const productById = React.useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );
  const [notifyLot, setNotifyLot] = React.useState<ProductLot | null>(null);

  return (
    <>
      <PageHeader
        title="Recall / retiro de lote"
        description="Marcar lote como retirado del mercado. Bloquea venta y permite contactar clientes que lo compraron."
        breadcrumbs={[
          { label: "Inventario", href: "/inventario" },
          { label: "Recall" },
        ]}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <BranchFilter value={branchFilter} onChange={setBranchFilter} />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Producto</TH>
                <TH>Lote</TH>
                <TH className="text-right">Stock al recall</TH>
                <TH>Vence</TH>
                <TH>Razón</TH>
                <TH>Estado</TH>
                <TH className="text-right pr-4">Acción</TH>
              </TR>
            </THead>
            <TBody>
              {lots.length === 0 && (
                <TR>
                  <TD colSpan={7} className="py-8 text-center text-sm opacity-60">
                    Sin lotes en recall.
                  </TD>
                </TR>
              )}
              {lots.map((lot) => {
                const p = productById.get(lot.productId);
                return (
                  <TR key={lot.id}>
                    <TD>
                      <div className="text-sm">{p?.name}</div>
                      <div className="font-mono text-xs opacity-60">{p?.sku}</div>
                    </TD>
                    <TD className="font-mono text-xs">{lot.lotNumber}</TD>
                    <TD className="text-right tabular-nums">
                      {lot.currentQuantity}
                    </TD>
                    <TD className="text-xs">{formatDate(lot.expiresAt)}</TD>
                    <TD className="text-xs opacity-80">{lot.notes ?? "—"}</TD>
                    <TD>{lotStatusBadge(lot.status)}</TD>
                    <TD className="pr-4">
                      <RowActions
                        canView={false}
                        canEdit={false}
                        canDelete={false}
                        customActions={[
                          {
                            label: "Notificar clientes",
                            icon: Users,
                            onClick: () => setNotifyLot(lot),
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

      {notifyLot && (
        <NotifyClientsModal
          lot={notifyLot}
          productName={productById.get(notifyLot.productId)?.name ?? "Producto"}
          onClose={() => setNotifyLot(null)}
        />
      )}
    </>
  );
}
