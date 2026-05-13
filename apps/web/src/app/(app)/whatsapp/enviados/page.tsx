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
import { mockWhatsappMessages } from "@/lib/mock-data/integrations";
import { formatDateTime } from "@/lib/utils/format";

export default function EnviadosPage() {
  const out = mockWhatsappMessages.filter((m) => m.direction === "outbound");
  return (
    <>
      <PageHeader
        title="Mensajes enviados"
        description="Estado por mensaje: queued / sent / delivered / read / failed."
        breadcrumbs={[
          { label: "WhatsApp", href: "/whatsapp" },
          { label: "Enviados" },
        ]}
      />
      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Fecha</TH>
                <TH>Conversación</TH>
                <TH>Mensaje</TH>
                <TH>Estado</TH>
              </TR>
            </THead>
            <TBody>
              {out.map((m) => (
                <TR key={m.id}>
                  <TD className="text-xs">{formatDateTime(m.createdAt)}</TD>
                  <TD className="font-mono text-xs">{m.conversationId}</TD>
                  <TD className="text-sm opacity-80 max-w-xl truncate">{m.body}</TD>
                  <TD>
                    <Badge
                      tone={
                        m.status === "read"
                          ? "success"
                          : m.status === "delivered" || m.status === "sent"
                            ? "info"
                            : m.status === "failed"
                              ? "danger"
                              : "warning"
                      }
                    >
                      {m.status}
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
