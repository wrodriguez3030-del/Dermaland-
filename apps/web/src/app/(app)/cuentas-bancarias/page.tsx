import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { BUSINESS_ADMIN_ROLES } from "@/features/billing/permissions";
import { BankAccountsForm } from "@/features/storefront/components/bank-accounts-form";
import { getSession } from "@/server/auth/context";
import { listAllBankAccounts } from "@/server/services/storefront/transfer-payments";

/**
 * Cuentas bancarias para cobrar por transferencia.
 *
 * Solo ADMIN, y la ruta de guardado vuelve a comprobarlo: un número equivocado
 * aquí manda el dinero de los clientes a otro sitio.
 */

export const dynamic = "force-dynamic";

export default async function CuentasBancariasPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/cuentas-bancarias");

  const puede =
    session.isPlatformAdmin || BUSINESS_ADMIN_ROLES.includes(session.user.role);
  if (!puede) redirect("/");

  const cuentas = await listAllBankAccounts(session.businessId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cuentas bancarias"
        description="A dónde transfieren los clientes de la tienda en línea. Sin ninguna cuenta activa, la tienda no ofrece pago por transferencia."
      />
      <BankAccountsForm initial={cuentas} />
    </div>
  );
}
