"use client";

import * as React from "react";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface ProductImageProps {
  src?: string | null;
  alt?: string | null;
  name?: string;
  className?: string;
  /** Tamaño en píxeles del cuadrado. Default 48. */
  size?: number;
  rounded?: "md" | "lg" | "xl";
}

/**
 * Miniatura de producto.
 *
 * Si `src` está vacío o falla en cargar (404), muestra un placeholder con
 * las iniciales del producto sobre fondo de marca. Esto evita que tablas y
 * cards se rompan cuando hay imágenes faltantes.
 */
export function ProductImage({
  src,
  alt,
  name,
  className,
  size = 48,
  rounded = "lg",
}: ProductImageProps) {
  const [errored, setErrored] = React.useState(false);
  const showImage = !!src && !errored;

  const initials = (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "·";

  const radius = {
    md: "rounded-md",
    lg: "rounded-lg",
    xl: "rounded-xl",
  }[rounded];

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden border border-black/5 bg-white",
        radius,
        className,
      )}
      style={{ width: size, height: size }}
      aria-label={alt ?? name ?? "Imagen de producto"}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src!}
          alt={alt ?? name ?? "Producto"}
          className="h-full w-full object-contain"
          onError={() => setErrored(true)}
          loading="lazy"
        />
      ) : (
        <div
          className={cn(
            "flex h-full w-full items-center justify-center bg-gradient-to-br from-[color:var(--brand-primary)]/15 to-[color:var(--brand-accent)]/10 text-[color:var(--brand-accent)]",
          )}
        >
          {name ? (
            <span
              className="font-bold leading-none tracking-tight"
              style={{ fontSize: Math.max(size * 0.32, 10) }}
            >
              {initials}
            </span>
          ) : (
            <Package
              aria-hidden
              style={{ width: size * 0.4, height: size * 0.4 }}
            />
          )}
        </div>
      )}
    </div>
  );
}
