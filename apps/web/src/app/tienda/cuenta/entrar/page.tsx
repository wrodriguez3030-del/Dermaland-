import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { signIn } from "@/server/auth/actions";
import { resolveStorefrontTenant } from "@/server/services/storefront/tenant";

export const metadata: Metadata = {
  title: "Entrar",
  robots: { index: false, follow: false },
};

/** Sin esto saldría como ruta estática en el build (`tienda-en-linea.md` §4.1). */
export const dynamic = "force-dynamic";

export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const tenant = await resolveStorefrontTenant();
  if (!tenant) notFound();

  async function action(formData: FormData): Promise<void> {
    "use server";
    const res = await signIn(formData);
    // A la cuenta, no a `/`: quien entra por aquí es un cliente, y `/` es el
    // panel del ERP, del que el portero lo devolvería igualmente.
    if (res.ok) redirect("/tienda/cuenta");
    redirect(
      `/tienda/cuenta/entrar?error=${encodeURIComponent(res.error ?? "No pudimos entrar.")}`,
    );
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-2xl font-bold tracking-tight text-[color:var(--brand-fg)]">
        Entrar
      </h1>
      <p className="mt-2 text-sm text-[color:var(--brand-fg)]/70">
        Con tu cuenta guardas tus datos y no tienes que repetirlos en cada
        pedido.
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-[color:var(--brand-warn)]/10 px-4 py-3 text-sm text-[color:var(--brand-fg)]/80"
        >
          {error}
        </p>
      ) : null}

      <form action={action} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="email"
            className="text-sm font-medium text-[color:var(--brand-fg)]"
          >
            Correo
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="password"
            className="text-sm font-medium text-[color:var(--brand-fg)]"
          >
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm"
          />
        </div>
        <button
          type="submit"
          className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-[color:var(--brand-primary)] px-6 text-base font-semibold text-white hover:bg-[color:var(--brand-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)] focus-visible:ring-offset-2"
        >
          Entrar
        </button>
      </form>

      <p className="mt-6 text-sm text-[color:var(--brand-fg)]/70">
        ¿No tienes cuenta?{" "}
        <Link
          href="/tienda/cuenta/registro"
          className="font-semibold text-[color:var(--brand-primary)] underline-offset-4 hover:underline"
        >
          Créala aquí
        </Link>
      </p>
    </div>
  );
}
