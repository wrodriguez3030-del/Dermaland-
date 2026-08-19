"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ExternalLink, Globe } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  HelpText,
  Input,
  Label,
  Textarea,
} from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { whatsappNumber } from "../../contact";
import { normalizeAzulPaymentLink } from "../../azul-link";
import { normalizePublicUrl } from "@/features/tenancy/branch-links";
import type { StorefrontSettings } from "@/server/services/storefront/admin";

/**
 * Configuración de la tienda, incluido el interruptor general.
 *
 * Encender la tienda pone el catálogo en internet: no es un ajuste más, así que
 * se pide confirmación explícita y se avisa de cuántos productos saldrían. La
 * ruta que lo guarda exige rol de administrador.
 */
export function StorefrontSettingsForm({
  settings,
  publishedCount,
}: {
  settings: StorefrontSettings | null;
  publishedCount: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = React.useState({
    siteName: settings?.siteName ?? "DermaLand",
    tagline: settings?.tagline ?? "",
    seoTitle: settings?.seoTitle ?? "",
    seoDescription: settings?.seoDescription ?? "",
    whatsappPhone: settings?.whatsappPhone ?? "",
    contactEmail: settings?.contactEmail ?? "",
    linktreeUrl: settings?.linktreeUrl ?? "",
    azulPaymentLinkUrl: settings?.azulPaymentLinkUrl ?? "",
  });
  const [guardando, setGuardando] = React.useState(false);
  const encendida = settings?.storefrontEnabled ?? false;

  const telefonoUtilizable =
    !form.whatsappPhone || !!whatsappNumber(form.whatsappPhone);

  /**
   * Guarda normalizando el árbol de enlaces primero. El usuario pega lo que
   * copió —a veces sin `https://`, a veces con el nombre del sitio delante— y
   * lo que se guarda es una URL reconstruida por nosotros: es lo que acabará en
   * un `href` de una página pública.
   */
  function guardar() {
    const enlace = normalizePublicUrl(form.linktreeUrl);
    if (!enlace.ok) {
      toast.error(enlace.error);
      return;
    }
    // El de Azul es más estricto: solo pagos.azul.com.do. Se le enseña a
    // clientes para que paguen; un tipeo no puede mandarlos a otro sitio.
    const azul = normalizeAzulPaymentLink(form.azulPaymentLinkUrl);
    if (!azul.ok) {
      toast.error(azul.error);
      return;
    }
    void enviar(
      {
        ...form,
        linktreeUrl: enlace.url ?? null,
        azulPaymentLinkUrl: azul.url,
      },
      "Configuración guardada.",
    );
  }

  async function enviar(cambios: Record<string, unknown>, exito: string) {
    setGuardando(true);
    try {
      const res = await fetch("/api/storefront/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cambios),
      });
      const cuerpo = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(cuerpo.error ?? "No se pudo guardar.");
        return;
      }
      toast.success(exito);
      router.refresh();
    } catch {
      toast.error(
        "No se pudo conectar. Revisa la conexión e intenta de nuevo.",
      );
    } finally {
      setGuardando(false);
    }
  }

  function alternarTienda() {
    if (!encendida) {
      if (publishedCount === 0) {
        toast.error(
          "Publica al menos un producto antes de encender la tienda.",
        );
        return;
      }
      const confirmado = window.confirm(
        `La tienda quedará visible en internet con ${publishedCount} producto(s). ¿Continuar?`,
      );
      if (!confirmado) return;
    }
    void enviar(
      { storefrontEnabled: !encendida },
      !encendida ? "Tienda encendida." : "Tienda apagada.",
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Tienda en línea</CardTitle>
            <CardDescription>
              Cómo se presenta la tienda pública y por dónde te escriben los
              clientes.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {encendida ? (
              <Badge tone="success">Encendida</Badge>
            ) : (
              <Badge tone="neutral">Apagada</Badge>
            )}
            {encendida ? (
              <a
                href="/tienda"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-black/15 bg-white px-3 text-sm font-medium hover:border-[color:var(--brand-primary)]"
              >
                <ExternalLink aria-hidden className="h-4 w-4" />
                Ver tienda
              </a>
            ) : null}
            <Button
              variant={encendida ? "outline" : "primary"}
              onClick={alternarTienda}
              disabled={guardando}
            >
              <Globe aria-hidden className="mr-2 h-4 w-4" />
              {encendida ? "Apagar tienda" : "Encender tienda"}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {!encendida ? (
          <p className="mb-5 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Con la tienda apagada, <code className="font-mono">/tienda</code>{" "}
              devuelve &laquo;página no encontrada&raquo; para todo el mundo.
              Nada de lo que publiques aquí se ve hasta que la enciendas.
            </span>
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="siteName">Nombre de la tienda</Label>
            <Input
              id="siteName"
              value={form.siteName}
              onChange={(e) => setForm({ ...form, siteName: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="tagline">Frase de presentación</Label>
            <Input
              id="tagline"
              value={form.tagline}
              onChange={(e) => setForm({ ...form, tagline: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="whatsappPhone">WhatsApp de la tienda</Label>
            <Input
              id="whatsappPhone"
              value={form.whatsappPhone}
              onChange={(e) =>
                setForm({ ...form, whatsappPhone: e.target.value })
              }
              placeholder="809-000-0000"
            />
            {telefonoUtilizable ? (
              <HelpText>
                Sin carrito, este botón ES la venta: aparece en cada ficha con
                el producto ya escrito en el mensaje.
              </HelpText>
            ) : (
              <p className="mt-1 text-xs text-[color:var(--brand-danger)]">
                Ese número no es marcable: el botón no aparecería en la tienda.
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="contactEmail">Correo de contacto</Label>
            <Input
              id="contactEmail"
              type="email"
              value={form.contactEmail}
              onChange={(e) =>
                setForm({ ...form, contactEmail: e.target.value })
              }
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="linktreeUrl">Linktree / árbol de enlaces</Label>
            <Input
              id="linktreeUrl"
              value={form.linktreeUrl}
              onChange={(e) =>
                setForm({ ...form, linktreeUrl: e.target.value })
              }
              placeholder="https://linktr.ee/tunegocio"
            />
            <p className="mt-1 text-xs text-black/50">
              Sale en el pie de la tienda, junto al WhatsApp y el Instagram.
              Sirve cualquier servicio: Linktree, Beacons o tu propia web.
            </p>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="azulPaymentLinkUrl">Enlace de pago Azul</Label>
            <Input
              id="azulPaymentLinkUrl"
              value={form.azulPaymentLinkUrl}
              onChange={(e) =>
                setForm({ ...form, azulPaymentLinkUrl: e.target.value })
              }
              placeholder="https://pagos.azul.com.do/..."
            />
            <p className="mt-1 text-xs text-black/50">
              Pega aquí tu enlace de pagos.azul.com.do. Con esto la tienda
              ofrece pagar con tarjeta; déjalo vacío para no ofrecerla.
            </p>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="storeSeoTitle">Título en Google</Label>
            <Input
              id="storeSeoTitle"
              value={form.seoTitle}
              onChange={(e) => setForm({ ...form, seoTitle: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="storeSeoDescription">Descripción en Google</Label>
            <Textarea
              id="storeSeoDescription"
              rows={2}
              value={form.seoDescription}
              onChange={(e) =>
                setForm({ ...form, seoDescription: e.target.value })
              }
            />
            <HelpText>
              Hasta 160 caracteres; lo que pase se corta en el resultado.
            </HelpText>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <Button
            onClick={guardar}
            disabled={guardando || !telefonoUtilizable}
          >
            {guardando ? "Guardando…" : "Guardar configuración"}
          </Button>
        </div>
      </CardContent>
      <toast.Toast />
    </Card>
  );
}
