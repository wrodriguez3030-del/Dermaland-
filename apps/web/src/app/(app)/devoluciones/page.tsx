import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui";
import { Undo2 } from "lucide-react";

export default function DevolucionesPage() {
  return (
    <>
      <PageHeader
        title="Devoluciones"
        description="Devoluciones parciales o totales. Genera nota de crédito asociada."
        breadcrumbs={[{ label: "Ventas" }, { label: "Devoluciones" }]}
        actions={<Button size="sm">Nueva devolución</Button>}
      />
      <EmptyState
        icon={Undo2}
        title="Sin devoluciones registradas"
        description="Las devoluciones se inician desde una venta existente. Cada una crea una nota de crédito vinculada y un movimiento de inventario `return_in`."
        action={<Button size="sm">Buscar venta para devolver</Button>}
      />
    </>
  );
}
