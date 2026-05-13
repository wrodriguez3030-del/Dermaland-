import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { StatCard } from "@/components/ui/stat-card";
import { CalendarClock, AlertTriangle, ShieldAlert } from "lucide-react";
import {
  getProductById,
  mockProductLots,
} from "@/lib/mock-data/catalog";
import { daysUntil, formatDate } from "@/lib/utils/format";
import { lotStatusBadge } from "@/features/inventory/lot-badges";

export default function VencimientosPage() {
  const lots = [...mockProductLots].sort(
    (a, b) => +new Date(a.expiresAt) - +new Date(b.expiresAt),
  );

  const expired = lots.filter((l) => daysUntil(l.expiresAt) < 0);
  const lt15 = lots.filter((l) => {
    const d = daysUntil(l.expiresAt);
    return d >= 0 && d < 15;
  });
  const lt30 = lots.filter((l) => {
    const d = daysUntil(l.expiresAt);
    return d >= 15 && d < 30;
  });
  const lt90 = lots.filter((l) => {
    const d = daysUntil(l.expiresAt);
    return d >= 30 && d < 90;
  });

  return (
    <>
      <PageHeader
        title="Alertas de vencimiento"
        description="Niveles 15 / 30 / 60 / 90 días según política configurable. POS bloquea venta de lotes vencidos."
        breadcrumbs={[
          { label: "Inventario", href: "/inventario" },
          { label: "Vencimientos" },
        ]}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Vencidos"
          value={expired.length}
          icon={ShieldAlert}
          tone="danger"
          hint="Bloqueados para venta"
        />
        <StatCard
          label="< 15 días"
          value={lt15.length}
          icon={AlertTriangle}
          tone="danger"
          hint="Crítico — promoción urgente"
        />
        <StatCard
          label="15-30 días"
          value={lt30.length}
          icon={CalendarClock}
          tone="warning"
        />
        <StatCard
          label="30-90 días"
          value={lt90.length}
          icon={CalendarClock}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lotes ordenados por proximidad a vencimiento</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Producto</TH>
                <TH>Lote</TH>
                <TH className="text-right">Cantidad</TH>
                <TH>Vence</TH>
                <TH>Días</TH>
                <TH>Estado</TH>
              </TR>
            </THead>
            <TBody>
              {lots.map((lot) => {
                const p = getProductById(lot.productId);
                const days = daysUntil(lot.expiresAt);
                const tone =
                  days < 0
                    ? "danger"
                    : days < 15
                      ? "danger"
                      : days < 30
                        ? "warning"
                        : "info";
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
                    <TD>
                      <Badge tone={tone}>
                        {days < 0 ? `${Math.abs(days)} d. vencido` : `${days} d.`}
                      </Badge>
                    </TD>
                    <TD>{lotStatusBadge(lot.status)}</TD>
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
