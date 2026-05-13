"use client";

import Link from "next/link";
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
import { mockRecommendations } from "@/lib/mock-data/dermatology";
import { formatDate, relativeTime } from "@/lib/utils/format";

const statusMeta: Record<
  string,
  { label: string; tone: "neutral" | "info" | "warning" | "success" }
> = {
  draft: { label: "Borrador", tone: "neutral" },
  delivered: { label: "Entregada", tone: "info" },
  follow_up: { label: "Seguimiento", tone: "warning" },
  completed: { label: "Completada", tone: "success" },
};

export default function RecomendacionesPage() {
  const { visible, hide } = useLocalSoftDelete(mockRecommendations);
  const toast = useToast();
  return (
    <>
      <PageHeader
        title="Recomendaciones dermatológicas"
        description="Rutinas personalizadas por cliente según tipo de piel, objetivos y condiciones observadas."
        breadcrumbs={[{ label: "Recomendaciones" }]}
        actions={
          <Link href="/recomendaciones/nueva">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Nueva recomendación
            </Button>
          </Link>
        }
      />
      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Cliente</TH>
                <TH>Tipo de piel</TH>
                <TH>Condiciones</TH>
                <TH>Objetivos</TH>
                <TH>Profesional</TH>
                <TH>Seguimiento</TH>
                <TH>Estado</TH>
                <TH className="text-right pr-4">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {visible.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <Link
                      href={`/recomendaciones/${r.id}`}
                      className="hover:text-[color:var(--brand-accent)] font-medium"
                    >
                      {r.customerName}
                    </Link>
                    <div className="text-xs opacity-50">
                      {relativeTime(r.createdAt)}
                    </div>
                  </TD>
                  <TD>
                    <Badge tone="primary">{r.skinType}</Badge>
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {r.conditionLabels.slice(0, 2).map((l) => (
                        <Badge key={l} tone="info" outlined>
                          {l}
                        </Badge>
                      ))}
                      {r.conditionLabels.length > 2 && (
                        <span className="text-[10px] opacity-50">
                          +{r.conditionLabels.length - 2}
                        </span>
                      )}
                    </div>
                  </TD>
                  <TD className="text-xs opacity-80">{r.goals.join(", ")}</TD>
                  <TD className="text-sm">{r.authorName}</TD>
                  <TD className="text-xs">
                    {r.followUpAt ? formatDate(r.followUpAt) : "—"}
                  </TD>
                  <TD>
                    <Badge tone={statusMeta[r.status]!.tone}>
                      {statusMeta[r.status]!.label}
                    </Badge>
                  </TD>
                  <TD className="pr-4">
                    <RowActions
                      viewHref={`/recomendaciones/${r.id}`}
                      editHref={`/recomendaciones/${r.id}/editar`}
                      onDelete={() => {
                        hide(r.id);
                        toast.success("Recomendación eliminada correctamente.");
                      }}
                      entityName={`la recomendación de ${r.customerName}`}
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
