import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  Select,
  Textarea,
} from "@/components/ui";
import { FormSection } from "@/components/ui/filter-bar";
import { mockCustomers } from "@/lib/mock-data/customers";
import {
  mockRoutineTemplates,
  mockSkinConditions,
  mockSkinTypes,
} from "@/lib/mock-data/dermatology";
import { mockProducts } from "@/lib/mock-data/catalog";

export default function NuevaRecomendacionPage() {
  return (
    <>
      <PageHeader
        title="Nueva recomendación"
        description="Construye una rutina dermatológica personalizada. Recomendación comercial — no diagnóstico médico definitivo."
        breadcrumbs={[
          { label: "Recomendaciones", href: "/recomendaciones" },
          { label: "Nueva" },
        ]}
        actions={
          <>
            <Button variant="outline" size="sm">Guardar borrador</Button>
            <Button size="sm">Entregar al cliente</Button>
          </>
        }
      />

      <Card>
        <CardContent>
          <FormSection
            title="Cliente"
            description="Selecciona o crea un perfil. Las recomendaciones quedan en su historial."
          >
            <div>
              <Label>Cliente *</Label>
              <Select>
                <option value="">— Seleccionar cliente —</option>
                {mockCustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.firstName} {c.lastName} · {c.customerNumber}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Profesional / cosmetólogo</Label>
                <Input defaultValue="Ana Guzmán" />
              </div>
              <div>
                <Label>Fecha de seguimiento</Label>
                <Input type="date" defaultValue="2026-06-30" />
              </div>
            </div>
          </FormSection>

          <FormSection title="Diagnóstico observado" description="Tipo de piel y condiciones detectadas.">
            <div>
              <Label>Tipo de piel *</Label>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {mockSkinTypes.map((s) => (
                  <label
                    key={s.key}
                    className="flex cursor-pointer flex-col rounded-lg border border-black/10 p-3 hover:border-[color:var(--brand-primary)]/40 has-[:checked]:border-[color:var(--brand-primary)] has-[:checked]:bg-[color:var(--brand-primary)]/5"
                  >
                    <div className="flex items-center gap-2">
                      <input type="radio" name="skin" value={s.key} />
                      <span className="text-sm font-medium">{s.label}</span>
                    </div>
                    <span className="mt-1 text-[11px] opacity-60">
                      {s.description}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <Label>Condiciones observadas</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {mockSkinConditions.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-black/10 px-3 py-1.5 text-xs hover:border-[color:var(--brand-primary)]/40 has-[:checked]:border-[color:var(--brand-primary)] has-[:checked]:bg-[color:var(--brand-primary)]/5"
                  >
                    <input type="checkbox" />
                    {c.name}
                    <Badge tone={c.severity === "severe" ? "danger" : c.severity === "moderate" ? "warning" : "neutral"}>
                      {c.severity}
                    </Badge>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <Label>Objetivos</Label>
              <Input placeholder="Reducir manchas, reforzar barrera, controlar acné…" />
            </div>
          </FormSection>

          <FormSection
            title="Rutina recomendada"
            description="Elige una plantilla o construye paso a paso."
          >
            <div>
              <Label>Plantilla base</Label>
              <Select>
                <option value="">— Personalizada —</option>
                {mockRoutineTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </div>
          </FormSection>

          <FormSection
            title="Productos sugeridos"
            description="Vinculados al catálogo. Aparecen en POS al volver el cliente."
          >
            <div className="space-y-2">
              {mockProducts.slice(0, 6).map((p) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-black/10 p-3 hover:border-[color:var(--brand-primary)]/40"
                >
                  <input type="checkbox" className="mt-1" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{p.name}</div>
                    <div className="text-xs opacity-60 font-mono">{p.sku}</div>
                  </div>
                </label>
              ))}
            </div>
          </FormSection>

          <FormSection title="Instrucciones" description="Texto entregado al cliente.">
            <div>
              <Label>Indicaciones de uso</Label>
              <Textarea placeholder="AM/PM, frecuencia, advertencias…" rows={5} />
            </div>
            <div>
              <Label>Notas internas</Label>
              <Textarea placeholder="Notas privadas para el equipo (no se entregan al cliente)…" />
            </div>
          </FormSection>
        </CardContent>
      </Card>
    </>
  );
}
