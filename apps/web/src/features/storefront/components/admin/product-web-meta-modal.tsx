"use client";

import * as React from "react";
import {
  Button,
  Input,
  Label,
  Modal,
  Textarea,
  HelpText,
} from "@/components/ui";
import type { AdminWebProduct } from "@/server/services/storefront/admin";

/**
 * Redacción de la ficha web de un producto.
 *
 * Existe porque el contenido comercial NO está en la base: los campos que el
 * tipo `Product` prometía (`benefits`, `modeOfUse`, `salesTip`…) nunca
 * existieron en `products`; eran restos del mock. Todo lo que el cliente lee en
 * la tienda se escribe aquí a mano.
 *
 * El nombre del catálogo del ERP viene en MAYÚSCULAS —sirve para una factura,
 * no para una ficha— así que el "título comercial" es el campo más útil de esta
 * ventana.
 */
export function ProductWebMetaModal({
  producto,
  onCerrar,
  onGuardar,
}: {
  producto: AdminWebProduct | null;
  onCerrar: () => void;
  onGuardar: (cambios: Record<string, unknown>) => Promise<boolean>;
}) {
  const [form, setForm] = React.useState<Record<string, string>>({});
  const [guardando, setGuardando] = React.useState(false);

  // Al abrir con otro producto, el formulario se rehace: sin esto quedarían los
  // textos del producto anterior y se guardarían sobre el nuevo.
  React.useEffect(() => {
    if (!producto) return;
    setForm({
      webTitle: producto.webTitle ?? "",
      webSummary: producto.webSummary ?? "",
      webDescription: producto.webDescription ?? "",
      benefits: producto.benefits.join("\n"),
      howToUse: producto.howToUse ?? "",
      seoTitle: producto.seoTitle ?? "",
      seoDescription: producto.seoDescription ?? "",
      imageAlt: producto.imageAlt ?? "",
    });
  }, [producto]);

  if (!producto) return null;

  const set =
    (campo: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [campo]: e.target.value }));

  async function guardar() {
    setGuardando(true);
    await onGuardar({
      webTitle: form.webTitle ?? "",
      webSummary: form.webSummary ?? "",
      webDescription: form.webDescription ?? "",
      benefits: (form.benefits ?? "")
        .split("\n")
        .map((b) => b.trim())
        .filter(Boolean)
        .slice(0, 8),
      howToUse: form.howToUse ?? "",
      seoTitle: form.seoTitle ?? "",
      seoDescription: form.seoDescription ?? "",
      imageAlt: form.imageAlt ?? "",
    });
    setGuardando(false);
  }

  return (
    <Modal
      open
      title="Ficha web del producto"
      onClose={onCerrar}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      }
    >
      <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
        <div>
          <p className="text-xs uppercase tracking-wide text-[color:var(--brand-fg)]/50">
            Nombre en el catálogo
          </p>
          <p className="text-sm font-medium text-[color:var(--brand-fg)]">
            {producto.name}
          </p>
        </div>

        <div>
          <Label htmlFor="webTitle">Título comercial</Label>
          <Input
            id="webTitle"
            value={form.webTitle ?? ""}
            onChange={set("webTitle")}
          />
          <HelpText>
            Lo que ve el cliente. Si se deja vacío se usa el nombre del
            catálogo, que está en mayúsculas.
          </HelpText>
        </div>

        <div>
          <Label htmlFor="webSummary">Resumen</Label>
          <Textarea
            id="webSummary"
            rows={2}
            value={form.webSummary ?? ""}
            onChange={set("webSummary")}
          />
          <HelpText>
            Una o dos líneas. Es lo que acompaña al producto en la ficha.
          </HelpText>
        </div>

        <div>
          <Label htmlFor="webDescription">Descripción</Label>
          <Textarea
            id="webDescription"
            rows={4}
            value={form.webDescription ?? ""}
            onChange={set("webDescription")}
          />
        </div>

        <div>
          <Label htmlFor="benefits">Beneficios</Label>
          <Textarea
            id="benefits"
            rows={4}
            value={form.benefits ?? ""}
            onChange={set("benefits")}
          />
          <HelpText>Uno por línea. Se publican hasta 8.</HelpText>
        </div>

        <div>
          <Label htmlFor="howToUse">Modo de uso</Label>
          <Textarea
            id="howToUse"
            rows={3}
            value={form.howToUse ?? ""}
            onChange={set("howToUse")}
          />
        </div>

        <div>
          <Label htmlFor="imageAlt">Descripción de la foto</Label>
          <Input
            id="imageAlt"
            value={form.imageAlt ?? ""}
            onChange={set("imageAlt")}
          />
          <HelpText>
            Para quien navega con lector de pantalla. Si se deja vacío se usa el
            título.
          </HelpText>
        </div>

        <div className="border-t border-black/5 pt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[color:var(--brand-fg)]/50">
            Buscadores
          </p>
          <div className="space-y-4">
            <div>
              <Label htmlFor="seoTitle">Título en Google</Label>
              <Input
                id="seoTitle"
                value={form.seoTitle ?? ""}
                onChange={set("seoTitle")}
              />
              <HelpText>Hasta 70 caracteres; lo que pase se corta.</HelpText>
            </div>
            <div>
              <Label htmlFor="seoDescription">Descripción en Google</Label>
              <Textarea
                id="seoDescription"
                rows={2}
                value={form.seoDescription ?? ""}
                onChange={set("seoDescription")}
              />
              <HelpText>Hasta 160 caracteres.</HelpText>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
