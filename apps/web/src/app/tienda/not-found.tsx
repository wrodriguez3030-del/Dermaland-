import Link from "next/link";

/**
 * 404 de la tienda.
 *
 * Cubre dos casos que para el visitante son el mismo: un producto que ya no se
 * publica y la tienda entera apagada. No se distinguen a propósito — decir "la
 * tienda está desactivada" anunciaría al mundo que existe pero está apagada.
 */
export default function TiendaNotFound() {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-[color:var(--brand-accent)]">
        Página no encontrada
      </p>
      <h1 className="mt-3 text-2xl font-bold tracking-tight text-[color:var(--brand-fg)]">
        No encontramos lo que buscabas
      </h1>
      <p className="mt-3 text-sm text-[color:var(--brand-fg)]/70">
        Es posible que el enlace haya cambiado o que el producto ya no esté disponible.
      </p>
      <Link
        href="/tienda"
        className="mt-8 inline-flex min-h-11 items-center rounded-xl bg-[color:var(--brand-primary)] px-6 text-sm font-semibold text-white transition-colors hover:bg-[color:var(--brand-accent)]"
      >
        Ir al catálogo
      </Link>
    </div>
  );
}
