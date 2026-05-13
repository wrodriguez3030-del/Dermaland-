import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui";
import { Receipt } from "lucide-react";
import Link from "next/link";
import { PosTerminal } from "@/features/pos/pos-terminal";

export default function PosPage() {
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
      <PosTerminal />
    </>
  );
}
