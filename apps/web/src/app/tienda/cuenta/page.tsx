import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { signOutCustomer } from "@/server/auth/actions";
import { resolveCustomerAccount } from "@/server/services/storefront/customer-account";
import { accountsEnabled } from "@/server/services/storefront/customer-account";
import { resolveStorefrontTenant } from "@/server/services/storefront/tenant";

export const metadata: Metadata = {
  title: "Mi cuenta",
  robots: { index: false, follow: false },
};

/** Sin esto saldría como ruta estática en el build (`tienda-en-linea.md` §4.1). */
export const dynamic = "force-dynamic";

/**
 * Mi cuenta.
 *
 * La sesión se comprueba AQUÍ y no en el middleware: `/tienda` entero es
 * público, y meter una llamada a Supabase en el middleware costaría un viaje de
 * red en cada visita a una página de catálogo que hoy sale de caché.
 *
 * No hay "Mis pedidos" todavía: los pedidos son F3.3, y una pantalla que sólo
 * podría decir "no tienes pedidos" no se construye.
 */
export default async function CuentaPage() {
  const tenant = await resolveStorefrontTenant();
  if (!tenant) notFound();
  // Con las cuentas cerradas esta página no existe: un formulario que falla
  // siempre es peor que una página que no está.
  if (!accountsEnabled()) notFound();

  const cuenta = await resolveCustomerAccount();
  if (!cuenta) redirect("/tienda/cuenta/entrar");

  const filas: Array<[string, string]> = [
    ["Nombre", `${cuenta.firstName} ${cuenta.lastName}`],
    ["Correo", cuenta.email],
    ["Teléfono", cuenta.phone ?? "—"],
  ];

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-bold tracking-tight text-[color:var(--brand-fg)]">
        Mi cuenta
      </h1>

      <dl className="mt-6 divide-y divide-black/5 rounded-2xl border border-black/5 bg-white">
        {filas.map(([etiqueta, valor]) => (
          <div key={etiqueta} className="flex justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-[color:var(--brand-fg)]/60">
              {etiqueta}
            </dt>
            <dd className="text-sm font-medium text-[color:var(--brand-fg)]">
              {valor}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 text-sm text-[color:var(--brand-fg)]/60">
        Para cambiar tus datos, escríbenos por WhatsApp y los actualizamos.
      </p>

      <form action={signOutCustomer} className="mt-8">
        <button
          type="submit"
          className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-black/10 bg-white px-5 text-sm font-medium text-[color:var(--brand-fg)] hover:border-[color:var(--brand-primary)] hover:text-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]"
        >
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}
