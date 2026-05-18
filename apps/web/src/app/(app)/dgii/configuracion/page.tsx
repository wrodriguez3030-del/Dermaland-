"use client";

import * as React from "react";
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
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { saveDgiiSettings } from "./actions";

/**
 * Configuración fiscal DGII.
 *
 * El form persiste vía la server action `saveDgiiSettings` que ruta al
 * repositorio activo:
 *  - DATA_SOURCE=mock: Map en memoria del proceso server (se pierde al reiniciar).
 *  - DATA_SOURCE=supabase: UPSERT a `dgii_settings` con RLS por tenant.
 *
 * Mientras no se ejecuten las migraciones 0003 + 0004, el flag de
 * persistencia real queda como "preparado" — el form sigue funcionando
 * contra el mock.
 */
export default function ConfigDgiiPage() {
  const [razonSocial, setRazonSocial] = React.useState("DermaLand SRL");
  const [nombreComercial, setNombreComercial] = React.useState("DermaLand");
  const [rnc, setRnc] = React.useState("13259077503");
  const [actividad, setActividad] = React.useState(
    "Venta de productos dermatológicos",
  );
  const [direccion, setDireccion] = React.useState(
    "Calle E. León Jiménez No. 47, Esq. Mayagüez, Reparto del Este, Santiago",
  );
  const [provinceCode, setProvinceCode] = React.useState<string | null>(null);
  const [municipioCode, setMunicipioCode] = React.useState<string | null>(null);
  const [telefono, setTelefono] = React.useState("809-226-5252");
  const [email, setEmail] = React.useState("fiscal@dermaland.do");
  const [ambiente, setAmbiente] = React.useState<
    "testecf" | "certecf" | "ecf"
  >("testecf");

  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState<
    | { kind: "idle" }
    | { kind: "ok"; at: string }
    | { kind: "error"; error: string }
  >({ kind: "idle" });

  const handleSave = async () => {
    setSaving(true);
    setStatus({ kind: "idle" });
    const res = await saveDgiiSettings({
      razonSocialEmisor: razonSocial,
      nombreComercial,
      rncEmisor: rnc.replace(/\D/g, ""),
      actividadEconomica: actividad,
      direccionEmisor: direccion,
      provincia: provinceCode,
      municipio: municipioCode,
      telefonoEmisor: telefono,
      correoEmisor: email,
      ambiente,
    });
    setSaving(false);
    if (res.ok) {
      setStatus({ kind: "ok", at: new Date().toLocaleTimeString("es-DO") });
    } else {
      setStatus({ kind: "error", error: res.error });
    }
  };

  return (
    <>
      <PageHeader
        title="Configuración fiscal"
        description="Datos del contribuyente para emisión de e-CF. Cambios afectan inmediatamente nuevos comprobantes."
        breadcrumbs={[
          { label: "DGII", href: "/dgii" },
          { label: "Configuración" },
        ]}
        actions={
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Guardando…
              </>
            ) : (
              <>Guardar</>
            )}
          </Button>
        }
      />

      <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
          <div className="text-sm text-amber-900">
            <strong>Persistencia preparada.</strong> Este form guarda en el
            repositorio activo. Con{" "}
            <code className="rounded bg-amber-100 px-1 font-mono text-xs">
              DATA_SOURCE=mock
            </code>{" "}
            (actual) los cambios viven en memoria del proceso server y se
            pierden al reiniciar. Cuando apliques las migraciones 0003 + 0004
            y cambies a <code className="rounded bg-amber-100 px-1 font-mono text-xs">DATA_SOURCE=supabase</code>{" "}
            los datos se persistirán en la tabla <code className="font-mono text-xs">dgii_settings</code> con RLS por tenant.
          </div>
        </div>
      </div>

      {status.kind === "ok" && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <CheckCircle2 className="h-4 w-4" />
          Configuración guardada · {status.at}
        </div>
      )}
      {status.kind === "error" && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          <strong>Error al guardar:</strong> {status.error}
        </div>
      )}

      <Card>
        <CardContent>
          <FormSection
            title="Contribuyente"
            description="Datos legales que aparecen en cada e-CF."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Razón social</Label>
                <Input
                  value={razonSocial}
                  onChange={(e) => setRazonSocial(e.target.value)}
                />
              </div>
              <div>
                <Label>Nombre comercial</Label>
                <Input
                  value={nombreComercial}
                  onChange={(e) => setNombreComercial(e.target.value)}
                />
              </div>
              <div>
                <Label>RNC (9 u 11 dígitos)</Label>
                <Input
                  value={rnc}
                  onChange={(e) => setRnc(e.target.value)}
                  placeholder="13259077503"
                />
              </div>
              <div>
                <Label>Actividad económica</Label>
                <Input
                  value={actividad}
                  onChange={(e) => setActividad(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label>Dirección fiscal</Label>
              <Input
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
              />
            </div>
            <div className="mt-3 rounded-lg border border-black/5 bg-black/[0.02] p-3">
              <DgiiLocationSelect
                label="Provincia / Municipio (códigos oficiales DGII)"
                onChange={({ provinceCode: p, municipioCode: m }) => {
                  setProvinceCode(p);
                  setMunicipioCode(m);
                }}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Teléfono (formato ddd-ddd-dddd)</Label>
                <Input
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="809-226-5252"
                />
              </div>
              <div>
                <Label>Email fiscal</Label>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
          </FormSection>

          <FormSection
            title="Ambiente"
            description="Probar primero en certificación antes de producción."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Ambiente DGII</Label>
                <Select
                  value={ambiente}
                  onChange={(e) =>
                    setAmbiente(
                      e.target.value as "testecf" | "certecf" | "ecf",
                    )
                  }
                >
                  <option value="testecf">testecf · pruebas internas</option>
                  <option value="certecf">certecf · certificación DGII</option>
                  <option value="ecf">ecf · producción (requiere autorización)</option>
                </Select>
              </div>
              <div>
                <Label>Usuario delegado</Label>
                <Input placeholder="usuario_dgii" />
              </div>
            </div>
            {ambiente === "ecf" && (
              <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900">
                <strong>⚠ Producción DGII:</strong> el ambiente{" "}
                <code className="font-mono">ecf</code> requiere certificado real,
                secuencias autorizadas y aprobación explícita del admin. El
                envío real está adicionalmente bloqueado por la columna{" "}
                <code className="font-mono">dgii_enabled_real_send</code>{" "}
                (default false).
              </div>
            )}
          </FormSection>

          <FormSection
            title="Estado del módulo"
            description="Activación controlada por súper admin."
          >
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
