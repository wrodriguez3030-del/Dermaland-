import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckoutView } from "@/features/storefront/components/checkout-view";
import { resolveCustomerAccount } from "@/server/services/storefront/customer-account";
import { paymentsEnabled } from "@/server/services/storefront/payments";
import { resolveStorefrontTenant } from "@/server/services/storefront/tenant";

export const metadata: Metadata = {
  title: "Confirmar pedido",
  robots: { index: false, follow: false },
};

/** Sin esto saldría como ruta estática en el build (`tienda-en-linea.md` §4.1). */
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const tenant = await resolveStorefrontTenant();
  if (!tenant) notFound();

  // Si entró con su cuenta, no tiene que reescribir lo que ya sabemos de él.
  const cuenta = await resolveCustomerAccount();

  return (
    <>
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-[color:var(--brand-fg)] sm:text-3xl">
        Confirmar pedido
      </h1>
      <CheckoutView
        branches={tenant.branches}
        cardPaymentsEnabled={paymentsEnabled()}
        prefill={
          cuenta
            ? {
                name: `${cuenta.firstName} ${cuenta.lastName}`.trim(),
                phone: cuenta.phone ?? "",
                email: cuenta.email,
              }
            : undefined
        }
      />
    </>
  );
}
