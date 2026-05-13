"use client";

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
import { Plus } from "lucide-react";
import { RowActions } from "@/components/ui/row-actions";
import { useLocalSoftDelete } from "@/components/ui/use-local-soft-delete";
import { useToast } from "@/components/ui/toast";
import { mockWebhooks } from "@/lib/mock-data/integrations";
import { relativeTime } from "@/lib/utils/format";

export default function WebhooksPage() {
  const { visible, hide } = useLocalSoftDelete(mockWebhooks);
  const toast = useToast();
  return (
    <>
      <PageHeader
        title="Webhooks"
        description="Eventos out con reintentos exponenciales. Firma HMAC-SHA256 con secret por webhook."
        breadcrumbs={[{ label: "API V3", href: "/api-v3" }, { label: "Webhooks" }]}
        actions={
          <Button size="sm">
            <Plus className="h-4 w-4" />
            Nuevo webhook
          </Button>
        }
      />
      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>URL</TH>
                <TH>Eventos</TH>
                <TH>Estado</TH>
                <TH className="text-right">Fallos</TH>
                <TH>Última entrega</TH>
                <TH className="text-right pr-4">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {visible.map((w) => (
                <TR key={w.id}>
                  <TD>
                    <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-xs">
                      {w.url}
                    </code>
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {w.events.map((e) => (
                        <Badge key={e} tone="info" outlined>
                          {e}
                        </Badge>
                      ))}
                    </div>
                  </TD>
                  <TD>
                    <Badge tone={w.status === "active" ? "success" : "neutral"}>
                      {w.status}
                    </Badge>
                  </TD>
                  <TD
                    className={`text-right tabular-nums ${
                      w.failureCount > 0 ? "text-rose-700 font-medium" : ""
                    }`}
                  >
                    {w.failureCount}
                  </TD>
                  <TD className="text-xs opacity-70">
                    {w.lastDeliveryAt ? relativeTime(w.lastDeliveryAt) : "—"}
                  </TD>
                  <TD className="pr-4">
                    <RowActions
                      viewHref={`/api-v3/webhooks/${w.id}`}
                      editHref={`/api-v3/webhooks/${w.id}/editar`}
                      onDelete={() => {
                        hide(w.id);
                        toast.success("Webhook eliminado correctamente.");
                      }}
                      entityName={w.url}
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
      <toast.Toast />
    </>
  );
}
