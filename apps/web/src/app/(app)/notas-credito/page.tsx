import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { FileMinus } from "lucide-react";

export default function NotasCreditoPage() {
  return (
    <>
      <PageHeader
        title="Notas de crédito"
        description="e-CF tipo 34 — generadas desde devoluciones o ajustes autorizados."
        breadcrumbs={[{ label: "Ventas" }, { label: "Notas de crédito" }]}
      />
      <EmptyState
        icon={FileMinus}
        title="Sin notas de crédito"
        description="Aparecen automáticamente al registrar una devolución o un ajuste fiscal autorizado."
      />
    </>
  );
}
