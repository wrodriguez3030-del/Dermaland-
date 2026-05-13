import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import { mockRoutineTemplates } from "@/lib/mock-data/dermatology";

export default function RutinasPage() {
  return (
    <>
      <PageHeader
        title="Plantillas de rutina"
        description="Plantillas reutilizables. Sirven de base al crear nuevas recomendaciones — editables por cliente."
        breadcrumbs={[
          { label: "Recomendaciones", href: "/recomendaciones" },
          { label: "Rutinas" },
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {mockRoutineTemplates.map((t) => (
          <Card key={t.id}>
            <CardHeader>
              <CardTitle>{t.name}</CardTitle>
              <p className="mt-1 text-sm opacity-60">{t.description}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {t.skinTypes.map((s) => (
                  <Badge key={s} tone="primary">{s}</Badge>
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {t.steps.map((s) => (
                <div key={s.order} className="flex items-start gap-2 text-sm">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-primary)]/10 text-[color:var(--brand-accent)] text-[10px] font-bold">
                    {s.order}
                  </span>
                  <div>
                    <Badge tone={s.moment === "morning" ? "warning" : s.moment === "evening" ? "purple" : "neutral"}>
                      {s.moment === "morning" ? "AM" : s.moment === "evening" ? "PM" : "Semanal"}
                    </Badge>{" "}
                    <span className="font-medium">{s.category}</span>
                    {s.productSuggestion && (
                      <span className="opacity-70"> → {s.productSuggestion}</span>
                    )}
                    <p className="text-xs opacity-70">{s.instructions}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
