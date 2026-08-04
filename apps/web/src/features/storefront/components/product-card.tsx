import Link from "next/link";
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
          <span className="absolute left-3 top-3 rounded-full bg-[color:var(--brand-accent)] px-2.5 py-1 text-xs font-semibold text-white">
            Nuevo
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1 border-t border-black/5 p-4">
        {product.brandName ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--brand-accent)]">
            {product.brandName}
          </p>
        ) : null}

        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-[color:var(--brand-fg)] group-hover:text-[color:var(--brand-primary)]">
          {product.title}
        </h3>

        {product.presentation ? (
          <p className="text-xs text-[color:var(--brand-fg)]/60">{product.presentation}</p>
        ) : null}

        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <p className="text-base font-bold text-[color:var(--brand-fg)]">
            {formatCurrency(product.price)}
          </p>
          <span
            className={
              agotado
                ? "rounded-full bg-black/5 px-2.5 py-1 text-xs font-medium text-[color:var(--brand-fg)]/60"
                : "rounded-full bg-[color:var(--brand-success)]/10 px-2.5 py-1 text-xs font-medium text-[color:var(--brand-success)]"
            }
          >
            {product.availability.label}
          </span>
        </div>
      </div>
    </Link>
  );
}
