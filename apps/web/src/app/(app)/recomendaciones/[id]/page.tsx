import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageSquare, Send } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import {
  mockRecommendations,
  mockRoutineTemplates,
  mockSkinTypes,
} from "@/lib/mock-data/dermatology";
import { mockProducts } from "@/lib/mock-data/catalog";
import { formatDate } from "@/lib/utils/format";

export default async function RecomendacionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const r = mockRecommendations.find((x) => x.id === id);
  if (!r) notFound();

  const skinType = mockSkinTypes.find((s) => s.key === r.skinType);
  const routine = r.routineTemplateId
    ? mockRoutineTemplates.find((t) => t.id === r.routineTemplateId)
    : undefined;
  const products = mockProducts.filter((p) => r.productIds.includes(p.id));

  return (
    <>
      <Link
        href="/recomendaciones"
        className="mb-4 inline-flex items-center gap-1 text-xs opacity-60 hover:opacity-100"
      >
        <ArrowLeft className="h-3 w-3" /> Volver
      </Link>

      <PageHeader
        title={`Rutina para ${r.customerName}`}
        description={`Tipo de piel: ${skinType?.label} · Profesional ${r.authorName} · ${formatDate(r.createdAt)}`}
        actions={
          <>
            <Button variant="outline" size="sm">
              <MessageSquare className="h-4 w-4" />
              Enviar WhatsApp
            </Button>
            <Button size="sm">
              <Send className="h-4 w-4" />
              Imprimir / PDF
            </Button>
          </>
        }
      />

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Diagnóstico</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <div className="text-xs uppercase tracking-wider opacity-50">Tipo de piel</div>
              <div className="mt-0.5 flex items-center gap-2">
                <Badge tone="primary">{skinType?.label}</Badge>
              </div>
              <p className="mt-1 text-xs opacity-70">{skinType?.description}</p>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider opacity-50">Condiciones</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {r.conditionLabels.map((l) => (
                  <Badge key={l} tone="info" outlined>
                    {l}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider opacity-50">Objetivos</div>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {r.goals.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </div>
            {r.followUpAt && (
              <div>
                <div className="text-xs uppercase tracking-wider opacity-50">Seguimiento</div>
                <div className="mt-0.5 font-medium">{formatDate(r.followUpAt)}</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Rutina paso a paso</CardTitle>
            {routine && (
              <p className="mt-1 text-xs opacity-60">
                Plantilla base: <strong>{routine.name}</strong>
              </p>
            )}
          </CardHeader>
          <CardContent>
            {!routine && (
              <p className="text-sm opacity-60">Sin rutina detallada (texto libre).</p>
            )}
            {routine && (
              <div className="space-y-2">
                {routine.steps.map((step) => (
                  <div
                    key={step.order}
                    className="flex items-start gap-3 rounded-lg border border-black/5 p-3"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-primary)] text-xs font-bold text-white">
                      {step.order}
                    </span>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={step.moment === "morning" ? "warning" : step.moment === "evening" ? "purple" : "neutral"}>
                          {step.moment === "morning"
                            ? "AM"
                            : step.moment === "evening"
                              ? "PM"
                              : "Semanal"}
                        </Badge>
                        <span className="text-sm font-medium">{step.category}</span>
                        {step.productSuggestion && (
                          <span className="text-xs opacity-70">
                            → {step.productSuggestion}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs opacity-80">{step.instructions}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Productos recomendados ({products.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => (
              <Link
                key={p.id}
                href={`/productos/${p.id}`}
                className="rounded-xl border border-black/5 bg-white p-3 hover:border-[color:var(--brand-primary)]/40 hover:shadow-sm"
              >
                <div className="text-sm font-medium leading-tight">{p.name}</div>
                <div className="mt-0.5 text-xs opacity-60 font-mono">{p.sku}</div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Indicaciones para el cliente</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-line text-sm">{r.instructions}</p>
        </CardContent>
      </Card>

      {r.internalNotes && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Notas internas</CardTitle>
            <p className="mt-1 text-xs opacity-60">No se entregan al cliente.</p>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line text-sm opacity-80">{r.internalNotes}</p>
          </CardContent>
        </Card>
      )}
    </>
  );
}
