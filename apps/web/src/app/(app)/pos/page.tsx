import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui";
import { Receipt } from "lucide-react";
import Link from "next/link";
import { PosTerminal } from "@/features/pos/pos-terminal";
import { getSession } from "@/server/auth/context";
import { canSwitchBillingBranch } from "@/features/tenancy/permissions";

export default async function PosPage() {
  // Rol REAL desde el JWT (app_metadata). Solo admin/manager/super_admin pueden
  // elegir a qué sucursal facturar; el resto queda fijo en la sucursal actual.
  // En modo demo (mock) la sesión es admin → puede cambiar.
  const session = await getSession();
  const canSwitchBranch = session
    ? canSwitchBillingBranch(session.user.role)
    : false;

  return (
    <>
      <PageHeader
        title="POS · Nueva venta"
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
      <PosTerminal canSwitchBranch={canSwitchBranch} />
    </>
  );
}
