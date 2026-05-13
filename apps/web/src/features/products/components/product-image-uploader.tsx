"use client";

import * as React from "react";
import { ImagePlus, Trash2, RotateCcw, AlertTriangle } from "lucide-react";
import { Button, HelpText } from "@/components/ui";
import { ProductImage } from "./product-image";
import { cn } from "@/lib/utils/cn";

interface ProductImageUploaderProps {
  value?: string | null;
  alt?: string;
  /** Callback cuando se sube, cambia o elimina la imagen. `null` = eliminada. */
  onChange: (imageUrl: string | null) => void;
  /** Tamaño máximo en MB. Default 2. */
  maxSizeMB?: number;
  /** Texto de ayuda override. */
  helpText?: string;
  /** Tamaño visual del preview en px. Default 160. */
  previewSize?: number;
  className?: string;
}

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Uploader de imagen de producto.
 *
 * MVP: convierte el archivo a data URL (base64) y lo pasa por `onChange`.
 * El padre decide cómo persistir (store con `dermaland.products` localStorage
 * para new/edit, etc.).
 *
 * Producción: el callback debería recibir un File y subir a Supabase Storage,
 * devolviendo la URL pública. Este componente es agnóstico al transporte —
 * solo emite el data URL listo para previsualizar y persistir.
 *
 * Validaciones suaves:
 *  - Tipo en `image/jpeg|png|webp`.
 *  - Tamaño <= `maxSizeMB`.
 *  - Si falla, muestra error inline; el valor previo se conserva.
 */
export function ProductImageUploader({
  value,
  alt,
  onChange,
  maxSizeMB = 2,
  helpText,
  previewSize = 160,
  className,
}: ProductImageUploaderProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [reading, setReading] = React.useState(false);

  const handleFile = (file: File) => {
    setError(null);
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Formato no permitido. Use JPG, PNG o WebP.");
      return;
    }
    const maxBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      setError(`La imagen no puede superar ${maxSizeMB} MB.`);
      return;
    }
    setReading(true);
    const reader = new FileReader();
    reader.onload = () => {
      setReading(false);
      onChange(typeof reader.result === "string" ? reader.result : null);
    };
    reader.onerror = () => {
      setReading(false);
      setError("No se pudo leer el archivo. Intenta otra imagen.");
    };
    reader.readAsDataURL(file);
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = ""; // permite re-subir el mismo archivo
  };

  const handleRemove = () => {
    setError(null);
    onChange(null);
  };

  const open = () => inputRef.current?.click();

  return (
    <div className={cn("flex items-start gap-4", className)}>
      <ProductImage
        src={value}
        alt={alt}
        name={alt}
        size={previewSize}
        rounded="xl"
        className="border border-black/10"
      />
      <div className="flex-1 min-w-0">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          className="sr-only"
          onChange={onInputChange}
        />
        <div className="flex flex-wrap gap-2">
          {!value && (
            <Button
              type="button"
              size="sm"
              variant="primary"
              onClick={open}
              disabled={reading}
            >
              <ImagePlus className="h-4 w-4" />
              {reading ? "Cargando…" : "Subir foto"}
            </Button>
          )}
          {value && (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={open}
                disabled={reading}
              >
                <RotateCcw className="h-4 w-4" />
                Cambiar foto
              </Button>
              <Button
                type="button"
                size="sm"
                variant="danger"
                onClick={handleRemove}
              >
                <Trash2 className="h-4 w-4" />
                Eliminar
              </Button>
            </>
          )}
        </div>
        <HelpText>
          {helpText ??
            `Formatos permitidos: JPG, PNG, WebP. Tamaño recomendado: 800×800 px. Máximo ${maxSizeMB} MB.`}
        </HelpText>
        {error && (
          <div className="mt-2 flex items-center gap-1 text-xs text-rose-700">
            <AlertTriangle className="h-3 w-3" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
