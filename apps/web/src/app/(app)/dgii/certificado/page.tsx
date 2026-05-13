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
} from "@/components/ui";
import { ShieldAlert, Upload } from "lucide-react";

export default function CertificadoPage() {
  return (
    <>
      <PageHeader
        title="Certificado digital"
        description="Archivo `.p12` o `.pfx` cifrado. Acceso solo desde Edge Function `dgii-sign-xml`."
        breadcrumbs={[{ label: "DGII", href: "/dgii" }, { label: "Certificado" }]}
      />

      <Card className="mb-6 border-amber-200 bg-amber-50">
        <CardContent>
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-700" />
            <div className="text-sm text-amber-900">
              <strong>Sin certificado cargado.</strong> El certificado digital
              permite firmar XAdES-BES los XML antes de enviarlos a DGII.
              Hasta que se cargue, el módulo DGII permanece inactivo y POS
              opera con proformas + comprobantes no fiscales.
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subir certificado</CardTitle>
          <p className="mt-1 text-xs opacity-60">
            Solo súper admin puede subir/reemplazar el certificado. La acción
            queda en auditoría con motivo obligatorio.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Archivo `.p12` / `.pfx`</Label>
            <div className="flex items-center gap-3">
              <Input type="file" />
              <Button variant="outline" size="sm">
                <Upload className="h-4 w-4" />
                Subir
              </Button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Contraseña del certificado</Label>
              <Input type="password" placeholder="••••••••" />
            </div>
            <div>
              <Label>Confirmar contraseña</Label>
              <Input type="password" placeholder="••••••••" />
            </div>
          </div>
          <p className="rounded-lg border border-black/5 bg-black/[0.02] p-3 text-xs opacity-70">
            La contraseña se cifra con KMS (Supabase Vault o variable derivada
            de `JWT_SECRET` + per-business salt). Nunca se expone en logs.
          </p>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Estado del certificado</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-3 text-sm">
            <div>
              <dt className="text-[10px] uppercase tracking-wider opacity-50">Estado</dt>
              <dd className="mt-0.5">
                <Badge tone="warning">Sin cargar</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider opacity-50">Vence</dt>
              <dd className="mt-0.5">—</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider opacity-50">Subido por</dt>
              <dd className="mt-0.5">—</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </>
  );
}
