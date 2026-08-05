import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui";
import { Receipt } from "lucide-react";
import Link from "next/link";
import { PosTerminal } from "@/features/pos/pos-terminal";
import { getSession } from "@/server/auth/context";
import { canSwitchBillingBranch } from "@/features/tenancy/permissions";

/**
 * `?pedido=<uuid>` llega desde el detalle de un pedido web: el POS se carga
 * solo con lo que pidió el cliente. Se lee AQUÍ, en el servidor, y se pasa como
 * prop — `useSearchParams` en el terminal obligaría a envolverlo en Suspense
 * para nada.
 */
export const dynamic = "force-dynamic";

export default async function PosPage({
  searchParams,
}: {
  searchParams: Promise<{ pedido?: string }>;
}) {
  // Rol REAL desde el JWT (app_metadata). Solo admin/manager/super_admin pueden
  // elegir a qué sucursal facturar; el resto queda fijo en la sucursal actual.
  // En modo demo (mock) la sesión es admin → puede cambiar.
  const session = await getSession();
  const canSwitchBranch = session
    ? canSwitchBillingBranch(session.user.role)
    : false;

  const { pedido } = await searchParams;

  return (
    <>
      <PageHeader
        title={pedido ? "POS · Facturar pedido web" : "POS · Nueva venta"}
        description="Toda venta nace como proforma. FEFO automático. Lotes vencidos / cuarentena bloqueados."
        breadcrumbs={[{ label: "Ventas" }, { label: "POS" }]}
        actions={
          <Link href="/proformas">
            <Button variant="outline" size="sm">
              <Receipt className="h-4 w-4" />
              Ver proformas
            </Button>
          </Link>
        }
      />
      <PosTerminal canSwitchBranch={canSwitchBranch} pedidoWebId={pedido} />
    </>
  );
}
