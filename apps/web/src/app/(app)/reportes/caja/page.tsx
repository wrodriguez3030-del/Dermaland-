import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { StatCard } from "@/components/ui/stat-card";
import { Coins, Download, AlertTriangle } from "lucide-react";
import { mockCashRegisterSessions } from "@/lib/mock-data/sales";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";

export default function ReporteCajaPage() {
  const sessions = mockCashRegisterSessions;
  const totalExpected = sessions.reduce((s, x) => s + x.expectedCash, 0);
  const totalDifference = sessions
    .filter((x) => x.difference != null)
    .reduce((s, x) => s + (x.difference ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Reporte de caja"
        description="Aperturas, cierres y diferencias por sesión y cajero."
        breadcrumbs={[{ label: "Reportes", href: "/reportes" }, { label: "Caja" }]}
        actions={
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4" />
            Exportar
          </Button>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Sesiones" value={sessions.length} icon={Coins} />
        <StatCard label="Efectivo esperado" value={formatCurrency(totalExpected)} icon={Coins} tone="primary" />
        <StatCard
          label="Diferencia acumulada"
          value={formatCurrency(totalDifference)}
          icon={AlertTriangle}
          tone={totalDifference < 0 ? "danger" : "default"}
        />
        <StatCard label="Sesiones con dif." value={sessions.filter((s) => s.difference !== 0 && s.difference != null).length} icon={AlertTriangle} tone="warning" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Detalle por sesión</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Sesión</TH>
                <TH>Cajero</TH>
                <TH>Estado</TH>
                <TH>Apertura</TH>
                <TH className="text-right">Esperado</TH>
                <TH className="text-right">Contado</TH>
                <TH className="text-right">Diferencia</TH>
              </TR>
            </THead>
            <TBody>
              {sessions.map((s) => (
                <TR key={s.id}>
                  <TD className="font-mono text-xs">{s.sessionNumber}</TD>
                  <TD className="text-sm">{s.cashierName}</TD>
                  <TD className="text-sm">{s.status}</TD>
                  <TD className="text-xs">{formatDateTime(s.openedAt)}</TD>
                  <TD className="text-right tabular-nums">{formatCurrency(s.expectedCash)}</TD>
                  <TD className="text-right tabular-nums">
                    {s.countedCash != null ? formatCurrency(s.countedCash) : "—"}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {s.difference != null ? formatCurrency(s.difference) : "—"}
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
