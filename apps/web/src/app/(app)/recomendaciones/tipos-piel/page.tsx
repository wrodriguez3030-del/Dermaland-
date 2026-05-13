import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import { mockSkinTypes } from "@/lib/mock-data/dermatology";

export default function TiposPielPage() {
  return (
    <>
      <PageHeader
        title="Tipos de piel"
        description="Catálogo dermatológico de referencia. Usado en formularios de recomendación."
        breadcrumbs={[
          { label: "Recomendaciones", href: "/recomendaciones" },
          { label: "Tipos de piel" },
        ]}
      />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {mockSkinTypes.map((s) => (
          <Card key={s.key}>
            <CardHeader>
              <CardTitle>{s.label}</CardTitle>
              <p className="mt-1 text-sm opacity-60">{s.description}</p>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div>
                <div className="font-medium opacity-70">Características</div>
                <ul className="mt-1 list-disc pl-5 opacity-80">
                  {s.characteristics.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="font-medium opacity-70">Ingredientes recomendados</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {s.recommendedIngredients.map((i) => (
                    <Badge key={i} tone="success" outlined>
                      {i}
                    </Badge>
                  ))}
                </div>
              </div>
              {s.avoidIngredients.length > 0 && (
                <div>
                  <div className="font-medium opacity-70">Evitar</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {s.avoidIngredients.map((i) => (
                      <Badge key={i} tone="danger" outlined>
                        {i}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
