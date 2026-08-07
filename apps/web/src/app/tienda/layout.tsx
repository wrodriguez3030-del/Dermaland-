import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, MessageCircle, PackageSearch, Phone } from "lucide-react";
import { AccountNav } from "@/features/storefront/components/account-nav";
import { CartBadge } from "@/features/storefront/components/cart-badge";
import { CartProvider } from "@/features/storefront/components/cart-provider";
import { CategoryNav } from "@/features/storefront/components/category-nav";
import { SearchBox } from "@/features/storefront/components/search-box";
import { whatsappLink } from "@/features/storefront/contact";
import { loadPublishedCatalog } from "@/server/services/storefront/catalog";
import {
  accountsEnabled,
  resolveCustomerAccount,
} from "@/server/services/storefront/customer-account";
import { resolveLastOrderLink } from "@/server/services/storefront/returning-customer";
import {
  resolveStorefrontTenant,
  storefrontBaseUrl,
} from "@/server/services/storefront/tenant";

/**
 * Envoltorio de todas las rutas públicas de la tienda.
 *
 * Aquí se resuelve el negocio UNA vez por petición (`cache()` de React lo
 * comparte con la página y con los metadatos) y se decide si la tienda existe.
 * Con la tienda apagada esto devuelve 404, no una página vacía: mientras el
 * dueño no la encienda, `/tienda` sencillamente no existe para nadie.
 *
 * Este layout NO usa sesión ni cookies. Es la razón por la que `/tienda` puede
 * estar en `PUBLIC_PATHS` del middleware sin abrir nada del ERP.
 */

/** Revalidación del catálogo. Cinco minutos entre lecturas a la base. */
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await resolveStorefrontTenant();
  if (!tenant) {
    return {
      title: "Tienda no disponible",
      robots: { index: false, follow: false },
    };
  }
  const titulo = tenant.seoTitle ?? tenant.siteName;
  const descripcion =
    tenant.seoDescription ??
    tenant.tagline ??
    `Dermocosmética y cuidado de la piel en ${tenant.branches[0]?.city ?? "República Dominicana"}.`;

  return {
    metadataBase: new URL(storefrontBaseUrl()),
    title: { default: titulo, template: `%s · ${tenant.siteName}` },
    description: descripcion,
    openGraph: {
      type: "website",
      siteName: tenant.siteName,
      title: titulo,
      description: descripcion,
      locale: "es_DO",
      ...(tenant.ogImageUrl ? { images: [{ url: tenant.ogImageUrl }] } : {}),
    },
  };
}

export default async function TiendaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tenant = await resolveStorefrontTenant();
  if (!tenant) notFound();

  const whatsapp = whatsappLink(tenant.whatsappPhone);
  // Misma llamada cacheada que usan la portada y el catálogo: `cache()` de React
  // la comparte dentro de la petición, así que el encabezado no cuesta un viaje
  // más a la base.
  const { categories } = await loadPublishedCatalog(tenant.businessId);
  // Sin cuentas abiertas no se enseña la puerta: el registro fallaría al
  // segundo cliente de la hora (ver `account/availability.ts`). Se puede comprar
  // sin cuenta, así que esto no frena una venta.
  const cuentasAbiertas = accountsEnabled();
  const cuenta = cuentasAbiertas ? await resolveCustomerAccount() : null;
  // El pedido en curso de este dispositivo, si lo hay. Su enlace ya existía y
  // se enseñaba UNA vez, al confirmar: quien cerraba la pestaña lo perdía y no
  // tenía forma de volver a encontrarlo desde la tienda.
  const pedidoEnCurso = await resolveLastOrderLink(tenant.businessId);

  return (
    // El carrito envuelve TODA la tienda: el contador del encabezado y la ficha
    // tienen que leer el mismo estado, y el layout es el único punto común.
    <CartProvider>
      <div className="flex min-h-screen flex-col bg-[color:var(--brand-bg)]">
        {/* Saltar al contenido: primer tabulador de la página, visible al enfocar. */}
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-[color:var(--brand-primary)] focus:px-4 focus:py-3 focus:text-white"
        >
          Saltar al contenido
        </a>

        <header className="sticky top-0 z-40 border-b border-black/5 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <Link
              href="/tienda"
              className="flex min-h-11 items-center gap-2.5 rounded-lg px-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]"
            >
              {/* Mismo archivo de marca que usan la barra lateral del ERP y los
                  PDF. Decorativo: el nombre va al lado en texto, así que un
                  `alt` repetiría lo que el lector de pantalla ya lee. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/dermaland-logo.svg"
                alt=""
                aria-hidden
                className="h-8 w-8 shrink-0 object-contain sm:h-9 sm:w-9"
              />
              <span className="text-lg font-bold tracking-tight text-[color:var(--brand-primary)] sm:text-xl">
                {tenant.siteName}
              </span>
            </Link>

            {/* En escritorio el buscador va en la fila del logo; en móvil no
              cabría —se quedaría en 120 px y nadie escribiría ahí— y baja a su
              propia fila. El lema se sacrifica: el buscador vale más. */}
            <SearchBox
              id="buscador-encabezado"
              className="hidden max-w-md flex-1 md:block"
            />

            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
              {/* Volver al pedido en curso. Va ANTES del carrito y con el número
                  visible: quien acaba de pedir vuelve a la tienda buscando
                  "¿en qué va lo mío?", y hasta ahora no había dónde mirar. */}
              {pedidoEnCurso ? (
                <Link
                  href={`/tienda/pedido/${pedidoEnCurso.token}`}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[color:var(--brand-primary)]/25 bg-[color:var(--brand-primary)]/5 px-3 text-xs font-semibold text-[color:var(--brand-primary)] transition-colors hover:bg-[color:var(--brand-primary)]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)] sm:text-sm"
                >
                  <PackageSearch aria-hidden className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">Mi pedido</span>
                  <span className="font-mono text-[10px] opacity-70 sm:text-xs">
                    {pedidoEnCurso.number}
                  </span>
                </Link>
              ) : null}
              {cuentasAbiertas ? <AccountNav nombre={cuenta?.firstName} /> : null}
              <CartBadge />

              {whatsapp ? (
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[color:var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[color:var(--brand-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[color:var(--brand-accent)]"
                >
                  <MessageCircle aria-hidden className="h-4 w-4" />
                  {/* En móvil el texto sobra: el icono ya es inequívoco y el espacio
                  hace falta para el nombre de la tienda. */}
                  <span className="hidden sm:inline">Escríbenos</span>
                  <span className="sr-only sm:hidden">
                    Escríbenos por WhatsApp
                  </span>
                </a>
              ) : null}
            </div>
          </div>

          <div className="mx-auto max-w-6xl px-4 pb-3 sm:px-6 md:hidden">
            <SearchBox id="buscador-movil" />
          </div>

          <CategoryNav categories={categories} />
        </header>

        <main
          id="contenido"
          className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6"
        >
          {children}
        </main>

        <footer className="mt-12 border-t border-black/5 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--brand-fg)]/50">
              Nuestras sucursales
            </h2>
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              {tenant.branches.map((sucursal) => {
                const tel = whatsappLink(sucursal.whatsapp ?? sucursal.phone);
                return (
                  <div key={sucursal.slug}>
                    <p className="font-semibold text-[color:var(--brand-fg)]">
                      {sucursal.name}
                    </p>
                    {sucursal.address ? (
                      <p className="mt-1 flex items-start gap-2 text-sm text-[color:var(--brand-fg)]/70">
                        <MapPin
                          aria-hidden
                          className="mt-0.5 h-4 w-4 shrink-0"
                        />
                        <span>
                          {sucursal.address}
                          {sucursal.city ? `, ${sucursal.city}` : ""}
                        </span>
                      </p>
                    ) : null}
                    {sucursal.phone ? (
                      <p className="mt-1 flex items-center gap-2 text-sm">
                        <Phone
                          aria-hidden
                          className="h-4 w-4 shrink-0 text-[color:var(--brand-fg)]/70"
                        />
                        {tel ? (
                          <a
                            href={tel}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[color:var(--brand-primary)] underline-offset-4 hover:underline"
                          >
                            {sucursal.phone}
                          </a>
                        ) : (
                          <span className="text-[color:var(--brand-fg)]/70">
                            {sucursal.phone}
                          </span>
                        )}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="mt-10 flex flex-col gap-2 border-t border-black/5 pt-6 text-xs text-[color:var(--brand-fg)]/60 sm:flex-row sm:items-center sm:justify-between">
              <p>
                © {new Date().getFullYear()} {tenant.siteName}. Todos los
                precios están en pesos dominicanos (RD$) e incluyen ITBIS.
              </p>
              {tenant.contactEmail ? (
                <a
                  href={`mailto:${tenant.contactEmail}`}
                  className="text-[color:var(--brand-primary)] underline-offset-4 hover:underline"
                >
                  {tenant.contactEmail}
                </a>
              ) : null}
            </div>
          </div>
        </footer>
      </div>
    </CartProvider>
  );
}
