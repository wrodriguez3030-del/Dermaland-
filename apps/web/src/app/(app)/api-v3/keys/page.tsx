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
import { Ban, Plus } from "lucide-react";
import { RowActions } from "@/components/ui/row-actions";
import { useLocalSoftDelete } from "@/components/ui/use-local-soft-delete";
import { useToast } from "@/components/ui/toast";
import { mockApiKeys } from "@/lib/mock-data/integrations";
import { formatDateTime, relativeTime } from "@/lib/utils/format";

export default function KeysPage() {
  const { visible, hide } = useLocalSoftDelete(mockApiKeys);
  const toast = useToast();
  return (
    <>
      <PageHeader
        title="API keys"
        description="Hasheadas en DB. Solo se muestra el secreto al crearlas."
        breadcrumbs={[{ label: "API V3", href: "/api-v3" }, { label: "Keys" }]}
        actions={
          <Button size="sm">
            <Plus className="h-4 w-4" />
            Generar key
          </Button>
        }
      />
      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Nombre</TH>
                <TH>Prefijo</TH>
                <TH>Scopes</TH>
                <TH>Rate limit</TH>
                <TH>Estado</TH>
                <TH>Último uso</TH>
                <TH>Creada</TH>
                <TH className="text-right pr-4">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {visible.map((k) => (
                <TR key={k.id}>
                  <TD className="font-medium">{k.name}</TD>
                  <TD>
                    <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-xs">
                      {k.prefix}…
                    </code>
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {k.scopes.map((s) => (
                        <Badge key={s} tone="info" outlined>
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </TD>
                  <TD className="text-xs">{k.rateLimitPerMinute}/min</TD>
                  <TD>
                    <Badge tone={k.status === "active" ? "success" : "neutral"}>
                      {k.status}
                    </Badge>
                  </TD>
                  <TD className="text-xs opacity-70">
                    {k.lastUsedAt ? relativeTime(k.lastUsedAt) : "—"}
                  </TD>
                  <TD className="text-xs">{formatDateTime(k.createdAt)}</TD>
                  <TD className="pr-4">
                    <RowActions
                      viewHref={`/api-v3/keys/${k.id}`}
                      editHref={`/api-v3/keys/${k.id}/editar`}
                      canDelete={false}
                      customActions={
                        k.status === "active"
                          ? [
                              {
                                label: "Revocar",
                                icon: Ban,
                                destructive: true,
                                onClick: () => {
                                  hide(k.id);
                                  toast.success(`Key ${k.name} revocada.`);
                                },
                                confirm: {
                                  title: "Revocar API key",
                                  message: `¿Revocar "${k.name}"? Las llamadas con esta key dejarán de funcionar inmediatamente.`,
                                },
                              },
                            ]
                          : []
                      }
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
