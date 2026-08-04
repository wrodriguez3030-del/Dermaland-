"use client";

import * as React from "react";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Foto de producto de la tienda, con marcador de posición digno.
 *
 * El servidor ya descarta las URLs que no son del bucket propio, pero un objeto
 * puede haberse borrado del Storage después de publicarse: sin este control el
 * navegador pintaría el icono de imagen rota, que en una tienda lee como
 * "esto está descuidado". Es cliente por el `onError` —no hay forma de
 * detectar el 404 de una imagen desde el servidor— y por nada más.
 *
 * Marco cuadrado y `object-contain`: los envases son verticales y horizontales
 * a la vez, y recortarlos (`object-cover`) le cortaría la tapa al producto.
 */
export function ProductPhoto({
  src,
  alt,
  title,
  className,
  priority = false,
}: {
  src: string | null;
  alt?: string;
  /** Para las iniciales del marcador cuando no hay foto. */
  title: string;
  className?: string;
  /** La primera foto visible se carga de inmediato; el resto, en diferido. */
  priority?: boolean;
}) {
  const [falló, setFalló] = React.useState(false);
  const hayFoto = !!src && !falló;

  const iniciales =
    title
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((palabra) => palabra[0]?.toUpperCase() ?? "")
      .join("") || "·";

  return (
    <div
      className={cn(
        "relative aspect-square w-full overflow-hidden rounded-xl bg-white",
        className,
      )}
    >
      {hayFoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          // `alt` vacío cuando el nombre del producto ya está junto a la imagen
          // sería lo ideal, pero aquí la foto es el enlace principal de la
          // tarjeta: describirla ayuda a quien navega con lector de pantalla.
          alt={alt ?? title}
          className="h-full w-full object-contain p-3"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          onError={() => setFalló(true)}
        />
      ) : (
        <div
          className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-[color:var(--brand-primary)]/10 to-[color:var(--brand-accent)]/5 text-[color:var(--brand-accent)]"
          role="img"
          aria-label={`Sin foto de ${title}`}
        >
          <Package aria-hidden className="h-8 w-8 opacity-70" />
          <span className="text-lg font-bold tracking-tight opacity-80">{iniciales}</span>
        </div>
      )}
    </div>
  );
}
