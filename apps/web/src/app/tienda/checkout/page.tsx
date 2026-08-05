import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckoutView } from "@/features/storefront/components/checkout-view";
import { resolveCustomerAccount } from "@/server/services/storefront/customer-account";
import { resolveRememberedCustomer } from "@/server/services/storefront/returning-customer";
import { paymentsEnabled } from "@/server/services/storefront/payments";
import { loadShippingRates } from "@/server/services/storefront/shipping";
import { listActiveBankAccounts } from "@/server/services/storefront/transfer-payments";
import { deliverableProvinces } from "@/features/storefront/shipping/quote";
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
  // Y si ya compró desde este mismo teléfono o computadora, tampoco. Se
  // reconoce el DISPOSITIVO y no el número tecleado: un buscador por teléfono
  // sería también una máquina de cosechar nombres y direcciones ajenas.
  const conocido = cuenta
    ? null
    : await resolveRememberedCustomer(tenant.businessId);
  // A qué provincias se llega hoy. Vacío = solo retiro, y la interfaz ni
  // siquiera enseña la opción de envío.
  const provincias = deliverableProvinces(
    await loadShippingRates(tenant.businessId),
  );
  // Sin cuentas no se ofrece transferencia: pedirle a alguien que transfiera
  // sin decirle a dónde es una vía muerta.
  const cuentas = await listActiveBankAccounts(tenant.businessId);

  return (
    <>
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-[color:var(--brand-fg)] sm:text-3xl">
        Confirmar pedido
      </h1>
      <CheckoutView
        branches={tenant.branches}
        cardPaymentsEnabled={paymentsEnabled()}
        provinces={provincias}
        bankAccounts={cuentas}
        prefill={
          cuenta
            ? {
                name: `${cuenta.firstName} ${cuenta.lastName}`.trim(),
                phone: cuenta.phone ?? "",
                email: cuenta.email,
              }
            : (conocido ?? undefined)
        }
        /** Solo el reconocido por dispositivo se puede "olvidar". */
        recognized={Boolean(conocido)}
      />
    </>
  );
}
