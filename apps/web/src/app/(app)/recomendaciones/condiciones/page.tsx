import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import { AlertTriangle } from "lucide-react";
import { mockSkinConditions } from "@/lib/mock-data/dermatology";

export default function CondicionesPage() {
  return (
    <>
      <PageHeader
        title="Condiciones dermatológicas"
        description="Catálogo de condiciones comunes. No reemplaza diagnóstico médico — para casos severos derivar a dermatólogo."
        breadcrumbs={[
          { label: "Recomendaciones", href: "/recomendaciones" },
          { label: "Condiciones" },
        ]}
      />
      <div className="grid gap-4 md:grid-cols-2">
        {mockSkinConditions.map((c) => (
          <Card key={c.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle>{c.name}</CardTitle>
                <Badge tone={c.severity === "severe" ? "danger" : c.severity === "moderate" ? "warning" : "neutral"}>
                  {c.severity}
                </Badge>
              </div>
              <p className="mt-1 text-sm opacity-60">{c.description}</p>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div>
                <div className="font-medium opacity-70">Ingredientes activos</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {c.commonIngredients.map((i) => (
                    <Badge key={i} tone="info" outlined>
                      {i}
                    </Badge>
                  ))}
                </div>
              </div>
              {c.warnings.length > 0 && (
                <div className="rounded-lg bg-amber-50 p-3 text-amber-900">
                  <div className="flex items-center gap-1 text-xs font-medium">
                    <AlertTriangle className="h-3 w-3" />
                    Advertencias
                  </div>
                  <ul className="mt-1 list-disc pl-4">
                    {c.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
