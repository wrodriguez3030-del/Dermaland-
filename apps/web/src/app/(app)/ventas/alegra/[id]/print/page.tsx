import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui";
import { Receipt80mm } from "@/features/sales/components/receipt-80mm";
import { PrintTicketButton } from "@/features/sales/components/print-ticket-button";
import { AutoPrint } from "@/features/sales/components/auto-print";
import { cargarFacturaMigrada } from "../cargar-factura";

/**
 * Ticket 80mm de una factura migrada de Alegra, listo para imprimir.
 *
 * Calcado de `caja/historial/[id]/print/page.tsx`: mismo layout de
 * controles, mismo `PrintTicketButton`. Requiere sesión (vive bajo `(app)`)
 * y la RLS + el filtro de `business_id` (dentro de `cargarFacturaMigrada`)
 * acotan a facturas del propio tenant.
 */

export const dynamic = "force-dynamic";

export default async function FacturaAlegraPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const { id } = await params;
  const { auto } = await searchParams;

  const cargada = await cargarFacturaMigrada(id);
  if (!cargada) notFound();

  return (
    <div className="mx-auto max-w-md py-6">
      <AutoPrint auto={auto === "1"} />

      {/* Los controles no salen en papel: el CSS de impresión solo deja el
          `.receipt-80mm`. */}
      <div className="mb-4 flex items-center justify-between gap-2 print:hidden">
        <Link href={`/ventas/alegra/${id}`}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
        </Link>
        <PrintTicketButton />
      </div>

      <Receipt80mm proforma={cargada.proforma} sucursal={cargada.sucursal} />
    </div>
  );
}
