import Link from "next/link";
import { Badge } from "@/components/ui";
import { formatCurrency } from "@/lib/utils/format";
import type { PublicProduct } from "../types";
import { ProductPhoto } from "./product-photo";

/**
 * Tarjeta de producto del catálogo.
 *
 * Toda la tarjeta es un solo enlace: dos enlaces al mismo destino (foto y
 * título) duplican las paradas del tabulador y del lector de pantalla sin
 * añadir nada.
 *
 * La disponibilidad se dice con TEXTO, no solo con color: "Agotado" en gris
 * sería invisible para quien no distingue ese gris del resto.
 */
export function ProductCard({
  product,
  priority = false,
}: {
  product: PublicProduct;
  /** Las primeras tarjetas cargan su foto de inmediato (LCP). */
  priority?: boolean;
}) {
  const agotado = product.availability.status === "out_of_stock";

  return (
    <Link
      href={`/tienda/producto/${product.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-black/5 bg-white transition-shadow hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)] focus-visible:ring-offset-2"
    >
      <div className="relative">
        <ProductPhoto
          src={product.imageUrl}
          alt={product.imageAlt}
          title={product.title}
          priority={priority}
        />
        {product.isNew && !agotado ? (
          // Fondo `--brand-primary` y no `--brand-accent`: en texto de 12 px el
          // acento deja el blanco en 3,7:1, por debajo del 4,5:1 que exige AA
          // (`DERMALAND_BRAND_AUDIT.md` §2).
          <span className="absolute left-3 top-3 rounded-full bg-[color:var(--brand-primary)] px-2.5 py-1 text-xs font-semibold text-white">
            Nuevo
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1 border-t border-black/5 p-4">
        {product.brandName ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--brand-primary)]">
            {product.brandName}
          </p>
        ) : null}

        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-[color:var(--brand-fg)] group-hover:text-[color:var(--brand-primary)]">
          {product.title}
        </h3>

        {product.presentation ? (
          <p className="text-xs text-[color:var(--brand-fg)]/60">
            {product.presentation}
          </p>
        ) : null}

        {/* La categoría orienta dentro de un estante, donde el visitante ya no
            tiene el filtro lateral a la vista para saber qué está mirando. */}
        {product.categoryName ? (
          <p className="text-xs text-[color:var(--brand-fg)]/50">
            {product.categoryName}
          </p>
        ) : null}

        {/* Precio y disponibilidad en columna, no en la misma línea: dentro de
            un estante la tarjeta mide 176 px y ahí se pisan. */}
        <div className="mt-auto flex flex-col items-start gap-1.5 pt-3">
          <p className="text-lg font-bold text-[color:var(--brand-fg)]">
            {formatCurrency(product.price)}
          </p>
          {/* Se reutiliza el Badge del ERP: su verde (emerald-700) da 5,5:1
              sobre el fondo claro, mientras que `--brand-success` se queda en
              3,3:1 y no llega a AA en texto pequeño. */}
          <Badge tone={agotado ? "neutral" : "success"}>
            {product.availability.label}
          </Badge>
        </div>
      </div>
    </Link>
  );
}
