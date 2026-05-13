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
} from "@/components/ui";
import { FormSection } from "@/components/ui/filter-bar";

export default function ConfiguracionPage() {
  return (
    <>
      <PageHeader
        title="Configuración general"
        description="Preferencias del business: moneda, locale, política fiscal, alertas."
        breadcrumbs={[{ label: "Administración" }, { label: "Configuración" }]}
        actions={<Button size="sm">Guardar cambios</Button>}
      />

      <Card>
        <CardContent>
          <FormSection
            title="Localización"
            description="Moneda, idioma y zona horaria del negocio."
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>Moneda</Label>
                <Select defaultValue="DOP">
                  <option value="DOP">DOP — Peso dominicano</option>
                  <option value="USD">USD — Dólar</option>
                </Select>
              </div>
              <div>
                <Label>Idioma</Label>
                <Select defaultValue="es-DO">
                  <option value="es-DO">Español (RD)</option>
                  <option value="es">Español</option>
                  <option value="en">English</option>
                </Select>
              </div>
              <div>
                <Label>Zona horaria</Label>
                <Select defaultValue="America/Santo_Domingo">
                  <option>America/Santo_Domingo</option>
                </Select>
              </div>
            </div>
          </FormSection>

          <FormSection
            title="Inventario"
            description="Reglas FEFO, alertas de vencimiento, conteos."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Política de selección de lote</Label>
                <Select defaultValue="fefo">
                  <option value="fefo">FEFO — el más próximo a vencer</option>
                  <option value="fifo">FIFO — el más antiguo recibido</option>
                </Select>
              </div>
              <div>
                <Label>Días de alerta de vencimiento</Label>
                <Input type="number" defaultValue="90" />
              </div>
              <div>
                <Label>Stock mínimo global</Label>
                <Input type="number" defaultValue="3" />
              </div>
              <div>
                <Label>Permitir entrada manual en conteo</Label>
                <Select defaultValue="role">
                  <option value="never">Nunca</option>
                  <option value="role">Solo con permiso</option>
                  <option value="always">Siempre</option>
                </Select>
              </div>
            </div>
          </FormSection>

          <FormSection
            title="POS"
            description="Comportamiento por defecto del punto de venta."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Bloquear venta de lote vencido</Label>
                <Select defaultValue="block">
                  <option value="block">Bloqueo duro</option>
                  <option value="warn">Advertencia + supervisor</option>
                </Select>
              </div>
              <div>
                <Label>Bloquear venta de lote en cuarentena</Label>
                <Select defaultValue="block">
                  <option value="block">Bloqueo duro</option>
                </Select>
              </div>
              <div>
                <Label>Tolerancia de diferencia de caja</Label>
                <Input defaultValue="50" />
              </div>
              <div>
                <Label>Imprimir ticket por defecto</Label>
                <Select defaultValue="thermal">
                  <option value="thermal">Térmico 80mm</option>
                  <option value="a4">A4</option>
                  <option value="none">No imprimir</option>
                </Select>
              </div>
            </div>
          </FormSection>

          <FormSection
            title="DGII"
            description="Configuración fiscal. Activable cuando llegue el certificado."
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Badge tone="warning">Inactivo</Badge>
                <span className="text-sm opacity-70">
                  POS opera con proformas y comprobantes no fiscales.
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Ambiente</Label>
                  <Select defaultValue="cert">
                    <option value="cert">Certificación</option>
                    <option value="prod">Producción</option>
                  </Select>
                </div>
                <div>
                  <Label>Certificado .p12</Label>
                  <Input disabled placeholder="No cargado" />
                </div>
              </div>
            </div>
          </FormSection>

          <FormSection
            title="Notificaciones"
            description="Webhooks y alertas por canal."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Email de alertas</Label>
                <Input defaultValue="dermalandrd@gmail.com" />
              </div>
              <div>
                <Label>Canal interno</Label>
                <Select defaultValue="whatsapp">
                  <option value="whatsapp">WhatsApp interno</option>
                  <option value="email">Email</option>
                  <option value="both">Ambos</option>
                </Select>
              </div>
            </div>
          </FormSection>
        </CardContent>
      </Card>
    </>
  );
}
