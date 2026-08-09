"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Textarea,
} from "@/components/ui";
import { FormSection } from "@/components/ui/filter-bar";
import { useToast } from "@/components/ui/toast";
import {
  normalizeInstagram,
  normalizePublicUrl,
} from "@/features/tenancy/branch-links";
import type { Business } from "@/types";

/**
 * Datos de la empresa (Administración → Empresa).
 *
 * Esta pantalla existía desde el principio como maqueta: leía datos de prueba
 * y su botón «Guardar cambios» no estaba conectado a nada. Se veía correcta, lo
 * que la hacía peor que no tenerla — quien corrigiera aquí su RNC se quedaba
 * tranquilo con el dato viejo saliendo en cada factura.
 *
 * Lo que NO se edita aquí, a propósito: el plan, el estado de la suscripción y
 * la habilitación DGII. Son decisiones de plataforma y viven en Súper Admin;
 * enseñarlas como campos editables sería repetir el mismo engaño.
 */
export function BusinessForm({ business }: { business: Business }) {
  const router = useRouter();
  const toast = useToast();

  const [form, setForm] = React.useState({
    commercialName: business.commercialName ?? "",
    legalName: business.legalName ?? "",
    rnc: business.rnc ?? "",
    phone: business.phone ?? "",
    whatsapp: business.whatsapp ?? "",
    email: business.email ?? "",
    instagramUrl: business.instagramUrl ?? "",
    website: business.website ?? "",
    address: business.address ?? "",
    city: business.city ?? "",
    province: business.province ?? "",
    slogan: business.slogan ?? "",
    description: business.description ?? "",
  });
  const [guardando, setGuardando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const set = (campo: keyof typeof form) => (valor: string) =>
    setForm((f) => ({ ...f, [campo]: valor }));

  async function guardar() {
    setError(null);

    if (!form.commercialName.trim() || !form.legalName.trim()) {
      setError("El nombre comercial y la razón social son obligatorios.");
      return;
    }

    // Los enlaces se normalizan ANTES de enviar: se publican en la tienda y en
    // documentos, y lo que se guarda debe ser una URL reconstruida por nosotros.
    const ig = normalizeInstagram(form.instagramUrl);
    if (!ig.ok) {
      setError(ig.error);
      return;
    }
    const web = normalizePublicUrl(form.website);
    if (!web.ok) {
      setError(web.error);
      return;
    }

    setGuardando(true);
    try {
      const res = await fetch("/api/business", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          instagramUrl: ig.url ?? null,
          website: web.url ?? null,
        }),
      });
      const cuerpo = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(cuerpo.error ?? "No se pudo guardar.");
        return;
      }
      toast.success("Datos de la empresa guardados.");
      router.refresh();
    } catch {
      setError("No se pudo conectar. Revisa la conexión e intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-end">
        <Button size="sm" onClick={guardar} disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="text-sm">{error}</div>
        </div>
      )}

      <Card>
        <CardContent>
          <FormSection
            title="Identidad comercial"
            description="El nombre comercial es el que ve el cliente; la razón social y el RNC son los que salen en cada comprobante fiscal."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Nombre comercial *</Label>
                <Input
                  value={form.commercialName}
                  onChange={(e) => set("commercialName")(e.target.value)}
                />
              </div>
              <div>
                <Label>Razón social *</Label>
                <Input
                  value={form.legalName}
                  onChange={(e) => set("legalName")(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>RNC</Label>
                <Input
                  value={form.rnc}
                  onChange={(e) => set("rnc")(e.target.value)}
                />
              </div>
              <div>
                <Label>País</Label>
                {/* Deshabilitado de verdad: cambiar de país cambiaría las reglas
                    fiscales enteras, no un texto en un recibo. */}
                <Input value={business.country} disabled />
              </div>
            </div>
          </FormSection>

          <FormSection
            title="Contacto"
            description="Datos visibles en la tienda en línea y en los mensajes de WhatsApp."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Teléfono</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => set("phone")(e.target.value)}
                />
              </div>
              <div>
                <Label>WhatsApp comercial</Label>
                <Input
                  value={form.whatsapp}
                  onChange={(e) => set("whatsapp")(e.target.value)}
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email")(e.target.value)}
                />
              </div>
              <div>
                <Label>Instagram</Label>
                <Input
                  value={form.instagramUrl}
                  onChange={(e) => set("instagramUrl")(e.target.value)}
                  placeholder="@dermaland"
                />
                <p className="mt-1 text-xs opacity-60">
                  Sale en el pie de la tienda. Vale el usuario o el enlace.
                </p>
              </div>
              <div className="sm:col-span-2">
                <Label>Sitio web</Label>
                <Input
                  value={form.website}
                  onChange={(e) => set("website")(e.target.value)}
                  placeholder="https://…"
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
              <Input
                value={form.address}
                onChange={(e) => set("address")(e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>Ciudad</Label>
                <Input
                  value={form.city}
                  onChange={(e) => set("city")(e.target.value)}
                />
              </div>
              <div>
                <Label>Provincia</Label>
                <Input
                  value={form.province}
                  onChange={(e) => set("province")(e.target.value)}
                />
              </div>
              <div>
                <Label>País</Label>
                <Input value={business.country} disabled />
              </div>
            </div>
          </FormSection>

          <FormSection
            title="Marca"
            description="Eslogan y descripción usados en documentos y en la tienda."
          >
            <div>
              <Label>Eslogan</Label>
              <Input
                value={form.slogan}
                onChange={(e) => set("slogan")(e.target.value)}
                maxLength={160}
              />
            </div>
            <div>
              <Label>Descripción del negocio</Label>
              <Textarea
                value={form.description}
                onChange={(e) => set("description")(e.target.value)}
                maxLength={2000}
                rows={3}
              />
            </div>
          </FormSection>

          <FormSection
            title="Plan y estado"
            description="Se gestiona desde Súper Admin; aquí sólo se consulta."
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                tone={business.status === "active" ? "success" : "warning"}
              >
                Suscripción: {etiquetaEstado(business.status)}
              </Badge>
              <Badge tone={business.dgiiEnabled ? "success" : "neutral"}>
                DGII e-CF: {business.dgiiEnabled ? "activo" : "inactivo"}
              </Badge>
            </div>
            <p className="text-xs opacity-60">
              El módulo DGII se activa al subir el certificado digital{" "}
              <code>.p12</code> desde Súper Admin → Empresa → DGII.
            </p>
          </FormSection>
        </CardContent>
      </Card>

      <toast.Toast />
    </>
  );
}

function etiquetaEstado(estado: Business["status"]): string {
  switch (estado) {
    case "active":
      return "activa";
    case "trial":
      return "en prueba";
    case "past_due":
      return "con pago vencido";
    case "suspended":
      return "suspendida";
    default:
      return estado;
  }
}
