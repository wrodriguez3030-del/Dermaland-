import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { signUpCustomer } from "@/server/services/storefront/customer-account";
import { accountsEnabled } from "@/server/services/storefront/customer-account";
import { resolveStorefrontTenant } from "@/server/services/storefront/tenant";

export const metadata: Metadata = {
  title: "Crear cuenta",
  robots: { index: false, follow: false },
};

/** Sin esto saldría como ruta estática en el build (`tienda-en-linea.md` §4.1). */
export const dynamic = "force-dynamic";

const CAMPOS = [
  {
    name: "firstName",
    label: "Nombre",
    type: "text",
    autoComplete: "given-name",
  },
  {
    name: "lastName",
    label: "Apellido",
    type: "text",
    autoComplete: "family-name",
  },
  { name: "phone", label: "Teléfono", type: "tel", autoComplete: "tel" },
  { name: "email", label: "Correo", type: "email", autoComplete: "email" },
  {
    name: "password",
    label: "Contraseña (mínimo 8 caracteres)",
    type: "password",
    autoComplete: "new-password",
  },
] as const;

export default async function RegistroPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; confirmar?: string }>;
}) {
  const sp = await searchParams;
  const tenant = await resolveStorefrontTenant();
  if (!tenant) notFound();
  // Con las cuentas cerradas esta página no existe: un formulario que falla
  // siempre es peor que una página que no está.
  if (!accountsEnabled()) notFound();

  async function action(formData: FormData): Promise<void> {
    "use server";
    const res = await signUpCustomer({
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
      phone: formData.get("phone"),
      email: formData.get("email"),
      password: formData.get("password"),
    });
    if (res.ok) {
      redirect(
        res.needsConfirmation
          ? "/tienda/cuenta/registro?confirmar=1"
          : "/tienda/cuenta",
      );
    }
    redirect(
      `/tienda/cuenta/registro?error=${encodeURIComponent(res.error ?? "No pudimos crear la cuenta.")}`,
    );
  }

  if (sp.confirmar) {
    return (
      <div className="mx-auto max-w-sm text-center">
        <h1 className="text-2xl font-bold tracking-tight text-[color:var(--brand-fg)]">
          Revisa tu correo
        </h1>
        <p className="mt-3 text-sm text-[color:var(--brand-fg)]/70">
          Te enviamos un enlace para confirmar tu cuenta. Ábrelo y ya podrás
          entrar.
        </p>
        <Link
          href="/tienda"
          className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-[color:var(--brand-primary)] underline-offset-4 hover:underline"
        >
          Volver a la tienda
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-2xl font-bold tracking-tight text-[color:var(--brand-fg)]">
        Crear cuenta
      </h1>
      <p className="mt-2 text-sm text-[color:var(--brand-fg)]/70">
        Si ya compraste con nosotros, usa el mismo teléfono o correo y
        reconoceremos tu ficha.
      </p>

      {sp.error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-[color:var(--brand-warn)]/10 px-4 py-3 text-sm text-[color:var(--brand-fg)]/80"
        >
          {sp.error}
        </p>
      ) : null}

      <form action={action} className="mt-6 space-y-4">
        {CAMPOS.map((campo) => (
          <div key={campo.name}>
            <label
              htmlFor={campo.name}
              className="text-sm font-medium text-[color:var(--brand-fg)]"
            >
              {campo.label}
            </label>
            <input
              id={campo.name}
              name={campo.name}
              type={campo.type}
              required
              autoComplete={campo.autoComplete}
              className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm"
            />
          </div>
        ))}
        <button
          type="submit"
          className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-[color:var(--brand-primary)] px-6 text-base font-semibold text-white hover:bg-[color:var(--brand-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)] focus-visible:ring-offset-2"
        >
          Crear cuenta
        </button>
      </form>

      <p className="mt-6 text-sm text-[color:var(--brand-fg)]/70">
        ¿Ya tienes cuenta?{" "}
        <Link
          href="/tienda/cuenta/entrar"
          className="font-semibold text-[color:var(--brand-primary)] underline-offset-4 hover:underline"
        >
          Entra aquí
        </Link>
      </p>
    </div>
  );
}
