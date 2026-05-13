"use client";

import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import { Plus } from "lucide-react";
import { RowActions } from "@/components/ui/row-actions";
import { useLocalSoftDelete } from "@/components/ui/use-local-soft-delete";
import { useToast } from "@/components/ui/toast";
import { mockWhatsappTemplates } from "@/lib/mock-data/integrations";

export default function PlantillasPage() {
  const { visible, hide } = useLocalSoftDelete(mockWhatsappTemplates);
  const toast = useToast();
  return (
    <>
      <PageHeader
        title="Plantillas WhatsApp"
        description="Plantillas aprobadas por Meta. Categoría transactional/service no requiere ventana de 24h."
        breadcrumbs={[
          { label: "WhatsApp", href: "/whatsapp" },
          { label: "Plantillas" },
        ]}
        actions={
          <Button size="sm">
            <Plus className="h-4 w-4" />
            Nueva plantilla
          </Button>
        }
      />
      <div className="grid gap-3 md:grid-cols-2">
        {visible.map((t) => (
          <Card key={t.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="font-mono text-sm">{t.name}</CardTitle>
                <div className="flex items-center gap-1">
                  <Badge tone="info" outlined>{t.category}</Badge>
                  <Badge
                    tone={
                      t.status === "approved"
                        ? "success"
                        : t.status === "pending"
                          ? "warning"
                          : "danger"
                    }
                  >
                    {t.status}
                  </Badge>
                  <RowActions
                    viewHref={`/whatsapp/plantillas/${t.id}`}
                    editHref={`/whatsapp/plantillas/${t.id}/editar`}
                    onDelete={() => {
                      hide(t.id);
                      toast.success("Plantilla eliminada correctamente.");
                    }}
                    entityName={t.name}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="rounded-lg bg-[color:var(--brand-bg)] p-3 text-sm">
                {t.body}
              </p>
              {t.variables.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {t.variables.map((v, i) => (
                    <Badge key={v} tone="neutral" outlined>
                      {`{{${i + 1}}}`} = {v}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <toast.Toast />
    </>
  );
}
