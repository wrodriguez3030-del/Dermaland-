"use client";

import * as React from "react";
import { Button, HelpText, Label } from "@/components/ui";
import { ImageOff, Upload } from "lucide-react";

interface CompanyLogoProps {
  /** Logo institucional actual (ruta pública o data URL). */
  initialLogo?: string;
  businessName: string;
}

/**
 * Carga y vista previa del logo de la empresa.
 *
 * La vista previa es 100% en el navegador (FileReader → data URL); la
 * persistencia real se hará al presionar "Guardar cambios" (placeholder, igual
 * que el resto del formulario de Empresa). Se acepta PNG/SVG/JPG; el valor
 * efectivo viaja en un input oculto `logoUrl` para el submit futuro.
 */
export function CompanyLogo({ initialLogo, businessName }: CompanyLogoProps) {
  const [logo, setLogo] = React.useState<string | undefined>(initialLogo);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogo(String(reader.result));
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div
        className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-black/10 bg-white"
        aria-label="Vista previa del logo"
      >
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt={`Logo de ${businessName}`}
            className="h-full w-full object-contain p-2"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-black/40">
            <ImageOff className="h-6 w-6" />
            <span className="text-[10px]">Sin logo</span>
          </div>
        )}
      </div>

      <div className="min-w-0">
        <Label>Logo institucional</Label>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="mr-1.5 h-4 w-4" />
            {logo ? "Cambiar logo" : "Cargar logo"}
          </Button>
          {logo && logo !== initialLogo && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setLogo(initialLogo)}
            >
              Restaurar
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/svg+xml,image/jpeg,image/webp"
          className="hidden"
          onChange={onFile}
        />
        <input type="hidden" name="logoUrl" value={logo ?? ""} />
        <HelpText>
          PNG, SVG o JPG. Recomendado cuadrado (512×512). Se usa en recibos,
          PDFs, comprobantes y en la vista de WhatsApp.
        </HelpText>
      </div>
    </div>
  );
}
