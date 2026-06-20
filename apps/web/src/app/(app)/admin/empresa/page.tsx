import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  Textarea,
  Badge,
} from "@/components/ui";
import { FormSection } from "@/components/ui/filter-bar";
import { mockBusiness } from "@/lib/mock-data/tenancy";
import { CompanyLogo } from "./company-logo";

export default function EmpresaPage() {
  const b = mockBusiness;
  return (
    <>
      <PageHeader
        title="Empresa"
        description="Datos del negocio. Estos campos se usan en facturas, recibos y comprobantes."
        breadcrumbs={[{ label: "Administración" }, { label: "Empresa" }]}
        actions={<Button size="sm">Guardar cambios</Button>}
      />

      <Card>
        <CardContent>
          <FormSection
            title="Identidad comercial"
            description="Nombre comercial y legal mostrados al cliente."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Nombre comercial</Label>
                <Input defaultValue={b.commercialName} />
              </div>
              <div>
                <Label>Razón social</Label>
                <Input defaultValue={b.legalName} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>RNC</Label>
                <Input defaultValue={b.rnc} />
              </div>
              <div>
                <Label>País</Label>
                <Input defaultValue={b.country} disabled />
              </div>
            </div>
          </FormSection>

          <FormSection
            title="Contacto"
            description="Datos visibles en el sitio web público y en mensajes de WhatsApp."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Teléfono</Label>
                <Input defaultValue={b.phone} />
              </div>
              <div>
                <Label>WhatsApp comercial</Label>
                <Input defaultValue={b.whatsapp} />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" defaultValue={b.email} />
              </div>
              <div>
                <Label>Instagram</Label>
                <Input defaultValue={b.instagramUrl} />
              </div>
              <div>
                <Label>Sitio web</Label>
                <Input
                  defaultValue={b.website ?? ""}
                  placeholder="https://… (pendiente)"
                />
              </div>
            </div>
          </FormSection>

          <FormSection
            title="Dirección"
            description="Sede / dirección fiscal mostrada en recibos y comprobantes."
          >
            <div>
              <Label>Dirección</Label>
              <Input defaultValue={b.address ?? ""} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>Ciudad</Label>
                <Input defaultValue={b.city ?? ""} />
              </div>
              <div>
                <Label>Provincia</Label>
                <Input defaultValue={b.province ?? ""} />
              </div>
              <div>
                <Label>País</Label>
                <Input defaultValue={b.country} disabled />
              </div>
            </div>
          </FormSection>

          <FormSection
            title="Branding"
            description="Logo institucional y eslogan usados en facturas, recibos, PDFs, comprobantes y WhatsApp."
          >
            <CompanyLogo initialLogo={b.logoUrl} businessName={b.commercialName} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Eslogan</Label>
                <Input defaultValue={b.slogan ?? ""} />
              </div>
              <div>
                <Label>Color primario</Label>
                <Input defaultValue="#2DB4A8" />
              </div>
            </div>
            <div>
              <Label>Descripción del negocio</Label>
              <Textarea defaultValue={b.description ?? ""} />
            </div>
          </FormSection>

          <FormSection
            title="Estado"
            description="Suscripción, plan activo y módulos habilitados."
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="primary">Plan Business / POS</Badge>
              <Badge tone="warning">Trial · vence 2026-06-04</Badge>
              <Badge tone={b.dgiiEnabled ? "success" : "neutral"}>
                DGII e-CF: {b.dgiiEnabled ? "activo" : "inactivo"}
              </Badge>
            </div>
            <p className="text-xs opacity-60">
              El módulo DGII se activará cuando subas el certificado digital
              `.p12` desde el panel de Súper Admin → Empresa → DGII.
            </p>
          </FormSection>
        </CardContent>
      </Card>
    </>
  );
}
