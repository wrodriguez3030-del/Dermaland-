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
import { mockAILogs } from "@/lib/mock-data/integrations";
import { formatDateTime } from "@/lib/utils/format";

export default function IALogsPage() {
  const totalCost = mockAILogs.reduce((s, l) => s + l.costUSD, 0);
  return (
    <>
      <PageHeader
        title="Logs y costos IA"
        description={`Cada acción del agente queda en ai_action_logs · Costo total visible: $${totalCost.toFixed(4)}`}
        breadcrumbs={[{ label: "IA", href: "/ia" }, { label: "Logs y costos" }]}
      />
      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Fecha</TH>
                <TH>Agente</TH>
                <TH>Tool</TH>
                <TH>Estado</TH>
                <TH className="text-right">Duración</TH>
                <TH className="text-right">Costo USD</TH>
              </TR>
            </THead>
            <TBody>
              {mockAILogs.map((l) => (
                <TR key={l.id}>
                  <TD className="text-xs">{formatDateTime(l.createdAt)}</TD>
                  <TD className="text-sm">{l.agentName}</TD>
                  <TD>
                    <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-xs">
                      {l.tool}
                    </code>
                  </TD>
                  <TD>
                    <Badge
                      tone={
                        l.status === "success"
                          ? "success"
                          : l.status === "handoff"
                            ? "warning"
                            : "danger"
                      }
                    >
                      {l.status}
                    </Badge>
                  </TD>
                  <TD className="text-right tabular-nums">{l.durationMs} ms</TD>
                  <TD className="text-right tabular-nums">${l.costUSD.toFixed(4)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
