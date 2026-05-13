import * as React from "react";
import { cn } from "@/lib/utils/cn";

export function FilterBar({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border border-black/5 bg-white p-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Sección de formulario: título arriba, descripción debajo, campos a continuación.
 *
 * Antes era un grid de 3 columnas (1 título / 2 inputs) que dejaba mucho
 * espacio vacío a la izquierda en pantallas wide. Ahora apila verticalmente —
 * más compacto y consistente. Cada sección queda separada por una línea sutil
 * (`border-b`), sin necesidad de envolver cada una en su propia card.
 */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "border-b border-black/5 py-6 first:pt-0 last:border-b-0 last:pb-0",
        className,
      )}
    >
      <div className="mb-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && (
          <p className="mt-1 text-xs opacity-60">{description}</p>
        )}
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}
