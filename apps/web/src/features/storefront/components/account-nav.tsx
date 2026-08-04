import Link from "next/link";
import { User } from "lucide-react";

/**
 * Acceso a la cuenta desde el encabezado.
 *
 * Server Component a propósito: quién eres lo resuelve el servidor, así que no
 * hay nada que hidratar ni ningún parpadeo de "Entrar" a tu nombre —al revés que
 * el contador del carrito, que sí vive en el navegador—.
 */
export function AccountNav({ nombre }: { nombre?: string }) {
  return (
    <Link
      href={nombre ? "/tienda/cuenta" : "/tienda/cuenta/entrar"}
      className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-2 text-sm font-medium text-[color:var(--brand-fg)] transition-colors hover:bg-[color:var(--brand-primary)]/5 hover:text-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]"
    >
      <User aria-hidden className="h-5 w-5" />
      <span className="hidden lg:inline">{nombre ?? "Entrar"}</span>
      <span className="sr-only lg:hidden">
        {nombre ? `Mi cuenta, ${nombre}` : "Entrar a mi cuenta"}
      </span>
    </Link>
  );
}
