import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CartView } from "@/features/storefront/components/cart-view";
import {
  resolveStorefrontTenant,
  storefrontBaseUrl,
} from "@/server/services/storefront/tenant";

/**
 * El carrito.
 *
 * `noindex`: su contenido es distinto para cada visitante y vacío para un
 * rastreador. Indexarlo solo serviría para que un buscador enseñe una página
 * vacía con el nombre de la tienda.
 */
export const metadata: Metadata = {
  title: "Tu carrito",
  robots: { index: false, follow: true },
};

/**
 * Sin esto la página sale ESTÁTICA en el build.
 *
 * Las demás rutas de la tienda escapan de la trampa porque leen `searchParams`,
 * y eso le dice a Next que dependen de la petición. Esta no lee ninguno: con la
 * tienda apagada, `notFound()` se ejecutaría en el build y quedaría congelado un
 * 404 que seguiría sirviéndose después de encenderla. Es el mismo tropiezo que
 * ya costó encontrar en `/tienda` (`docs/tienda-en-linea.md` §4.1).
 */
export const dynamic = "force-dynamic";

export default async function CarritoPage() {
  const tenant = await resolveStorefrontTenant();
  if (!tenant) notFound();

  return (
    <>
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-[color:var(--brand-fg)] sm:text-3xl">
        Tu carrito
      </h1>
      <CartView
        branches={tenant.branches}
        whatsappPhone={tenant.whatsappPhone}
        baseUrl={storefrontBaseUrl()}
      />
    </>
  );
}
