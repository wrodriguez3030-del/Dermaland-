import Link from "next/link";
import { formatCurrency } from "@/lib/utils/format";
import type { PublicProduct } from "../types";
import { productBlurb } from "../product-blurb";
import { ProductPhoto } from "./product-photo";
import { QuickAddButton } from "./quick-add-button";

/**
 * Tarjeta de producto del catálogo.
 *
 * DOS COSAS QUE CAMBIARON, y las dos por lo mismo: la tarjeta era un nombre y
 * un precio, y con eso nadie compra.
 *
 *  1. **Dice qué es y para qué piel.** El catálogo no tiene ni una descripción
 *     escrita, así que la línea se deriva del propio nombre —"matificante" está
 *     impreso en la caja— y lo que escriba el negocio manda sobre ella.
 *  2. **Se agrega desde aquí.** Antes había que entrar a la ficha, y una vez
 *     dentro el cliente se quedaba ahí. Ahora se agrega sin salir del listado y
 *     se sigue mirando.
 *
 * Ya no es un `<Link>` envolviéndolo todo: un botón dentro de un enlace es HTML
 * inválido y en la práctica el clic se lo lleva el enlace. Se usa el patrón del
 * enlace estirado —el `::after` del título cubre la tarjeta— que deja UNA sola
 * parada de tabulador para navegar, más el botón. El botón va por encima con
 * `relative z-10`, que es lo que le devuelve sus propios clics.
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
  const { summary, skinTypes } = productBlurb(product);

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-black/5 bg-white transition-shadow focus-within:ring-2 focus-within:ring-[color:var(--brand-accent)] focus-within:ring-offset-2 hover:shadow-lg">
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

        <h3 className="text-sm font-semibold leading-snug text-[color:var(--brand-fg)] group-hover:text-[color:var(--brand-primary)]">
          <Link
            href={`/tienda/producto/${product.slug}`}
            className="line-clamp-2 after:absolute after:inset-0 after:content-[''] focus:outline-none"
          >
            {product.title}
          </Link>
        </h3>

        {/* Qué es. Si el nombre no permite afirmar nada, no se pinta nada: un
            texto de relleno bajo cada ficha enseña a no leer ninguno. */}
        {summary ? (
          <p className="line-clamp-2 text-xs text-[color:var(--brand-fg)]/70">
            {summary}
          </p>
        ) : null}

        {product.presentation ? (
          <p className="text-xs text-[color:var(--brand-fg)]/50">
            {product.presentation}
          </p>
        ) : null}

        {/* Para qué piel. Es lo primero que pregunta quien compra
            dermocosmética, y saberlo sin abrir la ficha es lo que decide. */}
        {skinTypes.length > 0 ? (
          <ul className="mt-1 flex flex-wrap gap-1">
            {skinTypes.map((tipo) => (
              <li
                key={tipo}
                className="rounded-full bg-[color:var(--brand-primary)]/10 px-2 py-0.5 text-[11px] font-medium text-[color:var(--brand-primary)]"
              >
                {tipo}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-auto flex flex-col items-stretch gap-2 pt-3">
          <p className="text-lg font-bold text-[color:var(--brand-fg)]">
            {formatCurrency(product.price)}
          </p>
          {/* `relative z-10`: por encima del enlace estirado, o el clic se lo
              llevaría la tarjeta entera y acabaría en la ficha. */}
          <div className="relative z-10">
            <QuickAddButton slug={product.slug} disabled={agotado} />
          </div>
        </div>
      </div>
    </div>
  );
}
