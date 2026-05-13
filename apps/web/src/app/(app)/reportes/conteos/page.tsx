import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  Badge,
} from "@/components/ui";
import { StatCard } from "@/components/ui/stat-card";
import { ScanBarcode, AlertCircle, ShieldAlert } from "lucide-react";
import { mockCountItems, mockInventoryCounts } from "@/lib/mock-data/inventory-counts";

export default function ReporteConteosPage() {
  const approvedCounts = mockInventoryCounts.filter((c) => c.status === "approved").length;
  const totalShortages = mockCountItems.filter((i) => i.status === "shortage").length;
  const totalOverages = mockCountItems.filter((i) => i.status === "overage").length;
  const expiredFound = mockCountItems.filter((i) => i.status === "expired").length;

  return (
    <>
      <PageHeader
        title="Reporte de conteos físicos"
        description="Diferencias acumuladas, faltantes, sobrantes, lotes vencidos detectados."
        breadcrumbs={[{ label: "Reportes", href: "/reportes" }, { label: "Conteos" }]}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Conteos aprobados" value={approvedCounts} icon={ScanBarcode} tone="primary" />
        <StatCard label="Faltantes" value={totalShortages} icon={AlertCircle} tone="danger" />
        <StatCard label="Sobrantes" value={totalOverages} icon={AlertCircle} tone="warning" />
        <StatCard label="Vencidos detectados" value={expiredFound} icon={ShieldAlert} tone="danger" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Diferencias detalle</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Producto</TH>
                <TH>Lote</TH>
                <TH className="text-right">Esperado</TH>
                <TH className="text-right">Contado</TH>
                <TH className="text-right">Diferencia</TH>
                <TH>Estado</TH>
              </TR>
            </THead>
            <TBody>
              {mockCountItems
                .filter((i) => i.status !== "match")
                .map((it) => (
                  <TR key={it.id}>
                    <TD>
                      <div className="text-sm">{it.productName}</div>
                      <div className="text-xs opacity-60 font-mono">{it.productSku}</div>
                    </TD>
                    <TD className="font-mono text-xs">{it.lotNumber}</TD>
                    <TD className="text-right tabular-nums">{it.expectedQuantity}</TD>
                    <TD className="text-right tabular-nums">{it.countedQuantity}</TD>
                    <TD
                      className={`text-right tabular-nums font-medium ${
                        it.differenceQuantity < 0 ? "text-rose-700" : "text-amber-700"
                      }`}
                    >
                      {it.differenceQuantity > 0 ? "+" : ""}
                      {it.differenceQuantity}
                    </TD>
                    <TD>
                      <Badge tone={it.status === "shortage" ? "danger" : it.status === "overage" ? "warning" : it.status === "expired" ? "danger" : "info"}>
                        {it.status}
                      </Badge>
                    </TD>
                  </TR>
                ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
