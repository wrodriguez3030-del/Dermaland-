import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Card,
  CardContent,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { mockCashRegisterSessions } from "@/lib/mock-data/sales";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";

export default function HistorialCajaPage() {
  const sorted = [...mockCashRegisterSessions].sort(
    (a, b) => +new Date(b.openedAt) - +new Date(a.openedAt),
  );
  return (
    <>
      <PageHeader
        title="Historial de caja"
        description="Sesiones abiertas y cerradas. Toda apertura, cierre y diferencia queda en auditoría."
        breadcrumbs={[{ label: "Caja", href: "/caja" }, { label: "Historial" }]}
      />
      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Sesión</TH>
                <TH>Estado</TH>
                <TH>Cajero</TH>
                <TH>Apertura</TH>
                <TH>Cierre</TH>
                <TH className="text-right">Esperado</TH>
                <TH className="text-right">Contado</TH>
                <TH className="text-right">Diferencia</TH>
              </TR>
            </THead>
            <TBody>
              {sorted.map((s) => (
                <TR key={s.id}>
                  <TD className="font-mono text-xs">{s.sessionNumber}</TD>
                  <TD>
                    <Badge tone={s.status === "open" ? "info" : "neutral"}>
                      {s.status === "open" ? "Abierta" : "Cerrada"}
                    </Badge>
                  </TD>
                  <TD className="text-sm">{s.cashierName}</TD>
                  <TD className="text-xs">{formatDateTime(s.openedAt)}</TD>
                  <TD className="text-xs">
                    {s.closedAt ? formatDateTime(s.closedAt) : "—"}
                  </TD>
                  <TD className="text-right tabular-nums">{formatCurrency(s.expectedCash)}</TD>
                  <TD className="text-right tabular-nums">
                    {s.countedCash != null ? formatCurrency(s.countedCash) : "—"}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {s.difference != null ? (
                      <span className={s.difference < 0 ? "text-rose-700" : "text-emerald-700"}>
                        {formatCurrency(s.difference)}
                      </span>
                    ) : (
                      "—"
                    )}
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
