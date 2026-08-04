import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { BUSINESS_ADMIN_ROLES } from "@/features/billing/permissions";
import { ShippingRatesForm } from "@/features/storefront/components/shipping-rates-form";
import { getSession } from "@/server/auth/context";
import { listShippingRatesForAdmin } from "@/server/services/storefront/shipping";

/**
 * Costos de envío por provincia.
 *
 * Solo ADMIN: decidir a dónde se llega y por cuánto afecta al margen de cada
 * pedido. La ruta de guardado vuelve a comprobar el rol — que esta pantalla no
 * se pinte no impide que alguien llame a la API.
 */

export const dynamic = "force-dynamic";

export default async function EnviosPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/envios");

  const puede =
    session.isPlatformAdmin || BUSINESS_ADMIN_ROLES.includes(session.user.role);
  if (!puede) redirect("/");

  const filas = await listShippingRatesForAdmin(session.businessId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Costos de envío"
        description="A qué provincias se lleva el pedido a domicilio y cuánto cuesta el flete. Lo que no se marque aquí, no se ofrece en la tienda."
      />
      <ShippingRatesForm initial={filas} />
    </div>
  );
}
