import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  Badge,
  Button,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { ShieldAlert } from "lucide-react";
import {
  getProductById,
  mockProductLots,
} from "@/lib/mock-data/catalog";
import { formatDate } from "@/lib/utils/format";
import { lotStatusBadge } from "@/features/inventory/lot-badges";

export default function CuarentenaPage() {
  const lots = mockProductLots.filter(
    (l) => l.status === "quarantine" || l.status === "damaged",
  );
  return (
    <>
      <PageHeader
        title="Cuarentena"
        description="Lotes bloqueados para venta. Liberación requiere autorización + motivo."
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
                <TH className="text-right">Cantidad</TH>
                <TH>Recibido</TH>
                <TH>Estado</TH>
                <TH>Motivo</TH>
                <TH className="text-right pr-4">Acción</TH>
              </TR>
            </THead>
            <TBody>
              {lots.length === 0 && (
                <TR>
                  <TD colSpan={7} className="py-8 text-center text-sm opacity-60">
                    Sin lotes en cuarentena.
                  </TD>
                </TR>
              )}
              {lots.map((lot) => {
                const p = getProductById(lot.productId);
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
                    <TD className="text-xs">{formatDate(lot.receivedAt)}</TD>
                    <TD>{lotStatusBadge(lot.status)}</TD>
                    <TD className="text-xs opacity-80">{lot.notes ?? "—"}</TD>
                    <TD className="text-right pr-4">
                      <button className="text-xs font-medium text-emerald-700 hover:underline">
                        Liberar
                      </button>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
