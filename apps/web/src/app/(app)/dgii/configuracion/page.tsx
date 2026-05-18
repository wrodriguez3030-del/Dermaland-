"use client";

import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Card,
  CardContent,
  Button,
  Input,
  Label,
  Select,
} from "@/components/ui";
import { FormSection } from "@/components/ui/filter-bar";
import { DgiiLocationSelect } from "@/components/dgii/location-select";

export default function ConfigDgiiPage() {
  return (
    <>
      <PageHeader
        title="Configuración fiscal"
        description="Datos del contribuyente para emisión de e-CF. Cambios afectan inmediatamente nuevos comprobantes."
        breadcrumbs={[{ label: "DGII", href: "/dgii" }, { label: "Configuración" }]}
        actions={<Button size="sm">Guardar</Button>}
      />
      <Card>
        <CardContent>
          <FormSection title="Contribuyente" description="Datos legales que aparecen en cada e-CF.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Razón social</Label>
                <Input defaultValue="DermaLand SRL" />
              </div>
              <div>
                <Label>Nombre comercial</Label>
                <Input defaultValue="DermaLand" />
              </div>
              <div>
                <Label>RNC</Label>
                <Input defaultValue="1-32-59077-5" />
              </div>
              <div>
                <Label>Actividad económica</Label>
                <Input placeholder="Venta de productos dermatológicos" />
              </div>
            </div>
            <div>
              <Label>Dirección fiscal</Label>
              <Input defaultValue="Calle E. León Jiménez No. 47, Esq. Mayagüez, Reparto del Este, Santiago" />
            </div>
            <div className="mt-3 rounded-lg border border-black/5 bg-black/[0.02] p-3">
              <DgiiLocationSelect
                label="Provincia / Municipio (códigos oficiales DGII)"
                onChange={() => {
                  /* MOCK: no persiste todavía — Fase C añadirá persistencia
                     en dgii_settings. */
                }}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Teléfono</Label>
                <Input defaultValue="+1 809-226-5252" />
              </div>
              <div>
                <Label>Email fiscal</Label>
                <Input defaultValue="dermalandrd@gmail.com" />
              </div>
            </div>
          </FormSection>

          <FormSection title="Ambiente" description="Probar primero en certificación antes de producción.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Ambiente DGII</Label>
                <Select defaultValue="cert">
                  <option value="cert">Certificación (pruebas)</option>
                  <option value="prod">Producción</option>
                </Select>
              </div>
              <div>
                <Label>Usuario delegado</Label>
                <Input placeholder="usuario_dgii" />
              </div>
            </div>
          </FormSection>

          <FormSection title="Estado del módulo" description="Activación controlada por súper admin.">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="warning">Inactivo</Badge>
              <span className="text-sm opacity-70">
                Activar cuando se suba certificado válido `.p12`.
              </span>
            </div>
          </FormSection>
        </CardContent>
      </Card>
    </>
  );
}
