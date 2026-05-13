import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
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
} from "@/components/ui";
import { StatCard } from "@/components/ui/stat-card";
import { Send, AlertCircle, CheckCircle2 } from "lucide-react";
import { mockElectronicInvoices } from "@/lib/mock-data/integrations";
import { formatDateTime } from "@/lib/utils/format";

export default function EnviosPage() {
  const submitted = mockElectronicInvoices.filter((i) => i.submittedAt);
  const accepted = submitted.filter((i) => i.status === "accepted").length;
  const rejected = submitted.filter((i) => i.status === "rejected").length;
  const inProcess = submitted.filter((i) => i.status === "submitted" || i.status === "in_process").length;
  return (
    <>
      <PageHeader
        title="Envíos a DGII"
        description="Cola de envíos con reintentos. Si DGII tarda > 1h se activa modo contingencia."
        breadcrumbs={[{ label: "DGII", href: "/dgii" }, { label: "Envíos" }]}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Enviados" value={submitted.length} icon={Send} tone="primary" />
        <StatCard label="Aceptados" value={accepted} icon={CheckCircle2} tone="success" />
        <StatCard label="En proceso" value={inProcess} icon={Send} tone="warning" />
        <StatCard label="Rechazados" value={rejected} icon={AlertCircle} tone="danger" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Cola de envíos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>e-NCF</TH>
                <TH>Tipo</TH>
                <TH>Cliente</TH>
                <TH>Enviado</TH>
                <TH>TrackID</TH>
                <TH>Estado</TH>
              </TR>
            </THead>
            <TBody>
              {submitted.map((i) => (
                <TR key={i.id}>
                  <TD className="font-mono text-xs">{i.ecfNumber}</TD>
                  <TD className="text-xs">{i.ecfType}</TD>
                  <TD className="text-sm">{i.customerName}</TD>
                  <TD className="text-xs">
                    {i.submittedAt ? formatDateTime(i.submittedAt) : "—"}
                  </TD>
                  <TD className="font-mono text-[10px] opacity-70">{i.trackId}</TD>
                  <TD>
                    <Badge
                      tone={
                        i.status === "accepted"
                          ? "success"
                          : i.status === "rejected"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {i.status}
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
