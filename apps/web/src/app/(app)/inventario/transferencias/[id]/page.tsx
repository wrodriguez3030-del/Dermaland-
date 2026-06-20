"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Printer } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { resolveBranchName } from "@/features/tenancy/branch-store";
import { getProductById } from "@/lib/mock-data/catalog";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import {
  getTransfer,
  useTransfersTick,
} from "@/features/inventory/transfer-store";
import type { Transfer } from "@/features/inventory/transfer-store";


export default function TransferDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  useTransfersTick();

  const [mounted, setMounted] = React.useState(false);
  const [transfer, setTransfer] = React.useState<Transfer | undefined>();
  React.useEffect(() => {
    setMounted(true);
    setTransfer(getTransfer(id));
  }, [id]);

  if (!mounted) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-center text-sm opacity-70">
        Cargando transferencia…
      </div>
    );
  }

  if (!transfer) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader
          title="Transferencia no encontrada"
          breadcrumbs={[
            { label: "Inventario", href: "/inventario" },
            { label: "Transferencias", href: "/inventario/transferencias" },
            { label: id },
          ]}
        />
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm opacity-70">
              No encontramos la transferencia <code>{id}</code>.
            </p>
            <Link
              href="/inventario/transferencias"
              className="mt-4 inline-block text-sm text-[color:var(--brand-accent)] hover:underline"
            >
              ← Volver a transferencias
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <Link
        href="/inventario/transferencias"
        className="mb-4 inline-flex items-center gap-1 text-xs opacity-60 hover:opacity-100"
      >
        <ArrowLeft className="h-3 w-3" /> Volver a transferencias
      </Link>
      <PageHeader
        title={`Transferencia ${transfer.transferNumber}`}
        breadcrumbs={[
          { label: "Inventario", href: "/inventario" },
          { label: "Transferencias", href: "/inventario/transferencias" },
          { label: transfer.transferNumber },
        ]}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            aria-label="Imprimir"
            title="Imprimir"
          >
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
        }
      />

      <Card className="mb-6">
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={transfer.status === "completed" ? "success" : "neutral"}>
              {transfer.status === "completed" ? "Completada" : "Anulada"}
            </Badge>
            <span className="text-xs opacity-60">
              Creada {formatDateTime(transfer.createdAt)} por{" "}
              {transfer.createdByName}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-black/10 bg-black/[0.02] p-4 text-sm">
            <div>
              <div className="text-[10px] uppercase tracking-wider opacity-50">
                Origen
              </div>
              <div className="font-medium">
                {resolveBranchName(transfer.originBranchId)}
              </div>
            </div>
            <ArrowRight className="h-5 w-5 opacity-40" />
            <div>
              <div className="text-[10px] uppercase tracking-wider opacity-50">
                Destino
              </div>
              <div className="font-medium">
                {resolveBranchName(transfer.destinationBranchId)}
              </div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-[10px] uppercase tracking-wider opacity-50">
                Fecha
              </div>
              <div>{formatDate(transfer.transferDate)}</div>
            </div>
          </div>

          {transfer.notes && (
            <p className="mt-3 text-sm">
              <span className="opacity-50">Observaciones: </span>
              {transfer.notes}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="border-b border-black/5 px-4 py-3 text-sm font-semibold">
            Productos transferidos ({transfer.totalQuantity} unidades)
          </div>
          <Table>
            <THead>
              <TR>
                <TH>Producto</TH>
                <TH>Lote</TH>
                <TH>Vence</TH>
                <TH className="text-right">Cantidad</TH>
                <TH className="text-right pr-4">Costo unit.</TH>
              </TR>
            </THead>
            <TBody>
              {transfer.items.map((it) => {
                const p = getProductById(it.productId);
                return (
                  <TR key={it.id}>
                    <TD>
                      <div className="text-sm">{p?.name ?? it.productId}</div>
                      <div className="font-mono text-xs opacity-60">{p?.sku}</div>
                    </TD>
                    <TD className="font-mono text-xs">{it.lotNumber}</TD>
                    <TD className="text-xs">{formatDate(it.expiresAt)}</TD>
                    <TD className="text-right tabular-nums font-medium">
                      {it.quantity}
                    </TD>
                    <TD className="pr-4 text-right tabular-nums text-xs">
                      {it.unitCost}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <p className="mt-4 text-xs opacity-60">
        Movimientos registrados: <code>transfer_out</code> en el origen y{" "}
        <code>transfer_in</code> en el destino, con referencia{" "}
        <strong>{transfer.transferNumber}</strong>.
      </p>
    </>
  );
}
