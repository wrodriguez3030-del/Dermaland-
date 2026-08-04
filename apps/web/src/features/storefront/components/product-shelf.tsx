import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { HomeSection } from "../home-sections";
import { ProductCard } from "./product-card";

/**
 * Un estante horizontal de la portada.
 *
 * Se desplaza de lado en vez de envolver en varias filas: es lo que hace que la
 * portada quepa en una pantalla y se entienda de un vistazo cuántas secciones
 * hay. El desplazamiento es el nativo del navegador —sin JavaScript—, así que
 * funciona con rueda, con dedo y tabulando por los enlaces.
 *
 * El contenedor lleva `tabIndex={0}` y nombre accesible porque un área que se
 * desplaza tiene que poder recorrerse con el teclado sin depender de que haya
 * un enlace enfocable dentro.
 */
export function ProductShelf({
  section,
  priority = false,
}: {
  section: HomeSection;
  /** El primer estante carga sus fotos de inmediato (LCP). */
  priority?: boolean;
}) {
  const tituloId = `estante-${section.key.replace(/[^a-z0-9]+/gi, "-")}`;

  return (
    <section aria-labelledby={tituloId} className="mt-10 first:mt-0">
      <div className="flex items-baseline justify-between gap-4">
        <h2
          id={tituloId}
          className="text-lg font-bold tracking-tight text-[color:var(--brand-fg)] sm:text-xl"
        >
          {section.title}
        </h2>
        {section.href ? (
          <Link
            href={section.href}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-[color:var(--brand-primary)] underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]"
          >
            Ver todo
            <ChevronRight aria-hidden className="h-4 w-4" />
          </Link>
        ) : null}
      </div>

      <ul
        aria-label={section.title}
        tabIndex={0}
        className="-mx-4 mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)] sm:mx-0 sm:px-0"
      >
        {section.items.map((producto, indice) => (
          <li
            key={producto.slug}
            className="w-44 shrink-0 snap-start sm:w-52 lg:w-56"
          >
            <ProductCard product={producto} priority={priority && indice < 4} />
          </li>
        ))}
      </ul>
    </section>
  );
}
