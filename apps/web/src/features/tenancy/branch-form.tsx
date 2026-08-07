"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Select,
  Textarea,
} from "@/components/ui";
import { FormSection } from "@/components/ui/filter-bar";
import { useToast } from "@/components/ui/toast";
import {
  normalizeInstagram,
  normalizeMapsUrl,
} from "@/features/tenancy/branch-links";
import { saveBranch } from "@/features/tenancy/branch-store";
import type { Branch } from "@/types";

interface BranchFormProps {
  mode: "create" | "edit";
  branch?: Branch;
}

/** Formulario único de sucursal (crear / editar). */
export function BranchForm({ mode, branch }: BranchFormProps) {
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = React.useState(branch?.name ?? "");
  const [code, setCode] = React.useState(branch?.code ?? "");
  const [address, setAddress] = React.useState(branch?.address ?? "");
  const [city, setCity] = React.useState(branch?.city ?? "");
  const [province, setProvince] = React.useState(branch?.province ?? "");
  const [phone, setPhone] = React.useState(branch?.phone ?? "");
  const [email, setEmail] = React.useState(branch?.email ?? "");
  const [status, setStatus] = React.useState<"active" | "inactive">(
    branch?.status ?? "active",
  );
  const [showOnWebsite, setShowOnWebsite] = React.useState(
    branch?.showOnWebsite ?? false,
  );
  const [isPilot, setIsPilot] = React.useState(branch?.isPilot ?? false);
  const [mapsUrl, setMapsUrl] = React.useState(branch?.mapsUrl ?? "");
  const [instagram, setInstagram] = React.useState(branch?.instagramUrl ?? "");

  const [error, setError] = React.useState<string | null>(null);
  const [missing, setMissing] = React.useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = React.useState(false);
  const isMissing = (k: string) => missing.has(k);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    // Se normalizan ANTES de enviar para poder explicar el error junto al
    // campo. Un enlace mal pegado es el error más probable de esta pantalla:
    // decir "revisa el formulario" sin señalar cuál sería inútil.
    const maps = normalizeMapsUrl(mapsUrl);
    if (!maps.ok) {
      setSubmitting(false);
      setMissing(new Set(["mapsUrl"]));
      setError(maps.error);
      return;
    }
    const ig = normalizeInstagram(instagram);
    if (!ig.ok) {
      setSubmitting(false);
      setMissing(new Set(["instagramUrl"]));
      setError(ig.error);
      return;
    }

    const payload = {
      name,
      code,
      address,
      city,
      province,
      phone: phone || undefined,
      email: email || undefined,
      showOnWebsite,
      isPilot,
      status,
      // `null` (no `undefined`) para poder BORRAR un enlace: `undefined` haría
      // que el repositorio se saltara la columna y el enlace viejo seguiría
      // publicado después de vaciar el campo.
      mapsUrl: maps.url ?? null,
      instagramUrl: ig.url ?? null,
    };

    const res = await saveBranch(mode, payload, branch?.id);

    setSubmitting(false);
    if (!res.ok) {
      setMissing(new Set(res.missingFields ?? []));
      setError(res.error);
      return;
    }
    setMissing(new Set());
    toast.success(
      mode === "create" ? "Sucursal creada." : "Cambios guardados.",
    );
    setTimeout(() => router.push(`/admin/sucursales/${res.branch.id}`), 600);
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className="mb-6 flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => router.back()}
          disabled={submitting}
        >
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting
            ? "Guardando…"
            : mode === "create"
              ? "Crear sucursal"
              : "Guardar cambios"}
        </Button>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
          <AlertTriangle className="mt-0.5 h-5 w-5" />
          <div className="text-sm">{error}</div>
        </div>
      )}

      <Card>
        <CardContent>
          <FormSection title="Identidad" description="Nombre y código únicos de la sucursal.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Nombre *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="DermaLand Santiago"
                  className={isMissing("name") ? "border-rose-400" : undefined}
                />
              </div>
              <div>
                <Label>Código *</Label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="STG-01"
                  className={isMissing("code") ? "border-rose-400" : undefined}
                />
              </div>
            </div>
          </FormSection>

          <FormSection title="Ubicación" description="Dirección visible en recibos y comprobantes.">
            <div>
              <Label>Dirección</Label>
              <Textarea value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Ciudad</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div>
                <Label>Provincia</Label>
                <Input value={province} onChange={(e) => setProvince(e.target.value)} />
              </div>
            </div>

            {/* El enlace de Maps es lo que convierte «dónde queda» en una ruta.
                Se admite el enlace corto, el largo, y hasta el texto completo
                que copia el botón «Compartir» del móvil: normalizar es trabajo
                nuestro, no del usuario (ver `branch-links.ts`). */}
            <div>
              <Label>Enlace de Google Maps</Label>
              <Input
                value={mapsUrl}
                onChange={(e) => setMapsUrl(e.target.value)}
                placeholder="https://maps.app.goo.gl/…"
                className={isMissing("mapsUrl") ? "border-rose-400" : undefined}
              />
              <p className="mt-1 text-xs text-[color:var(--fg-muted,#64748b)]">
                Abre la sucursal en Google Maps, toca <strong>Compartir</strong>{" "}
                y pega aquí lo que copia. Sale en la tienda como{" "}
                <strong>«Cómo llegar»</strong>.
              </p>
            </div>
          </FormSection>

          <FormSection title="Contacto">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Teléfono</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Instagram</Label>
              <Input
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="@dermaland"
                className={
                  isMissing("instagramUrl") ? "border-rose-400" : undefined
                }
              />
              <p className="mt-1 text-xs text-[color:var(--fg-muted,#64748b)]">
                Sólo si esta sucursal tiene cuenta propia. Si la dejas vacía, en
                la tienda sale el Instagram de la empresa.
              </p>
            </div>
          </FormSection>

          <FormSection title="Estado y visibilidad">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Estado</Label>
                <Select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as "active" | "inactive")}
                >
                  <option value="active">Activa</option>
                  <option value="inactive">Inactiva</option>
                </Select>
              </div>
              <div className="flex flex-col justify-center gap-2 pt-5">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={showOnWebsite}
                    onChange={(e) => setShowOnWebsite(e.target.checked)}
                  />
                  Visible en sitio web
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={isPilot}
                    onChange={(e) => setIsPilot(e.target.checked)}
                  />
                  Sucursal piloto / principal
                </label>
              </div>
            </div>
          </FormSection>
        </CardContent>
      </Card>

      <toast.Toast />
    </form>
  );
}
