import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, Button } from "@/components/ui";
import { Receipt80mm } from "@/features/sales/components/receipt-80mm";
import { BotonVolver } from "@/features/ventas/boton-volver";
import { formatDate } from "@/lib/utils/format";
import { cargarFacturaMigrada } from "./cargar-factura";
import { etiquetaPagoAlegra } from "./etiqueta-pago-alegra";
import { hayDescuadreAlegra } from "./descuadre-alegra";

/**
 * Ver una factura migrada de Alegra: cabecera + ticket 80mm en pantalla
 * (`preview`), sin poder editarla ni cobrarla — Alegra manda. El botón
 * «Imprimir» lleva a `/print?auto=1`, que dispara la impresión sola.
 */

export const dynamic = "force-dynamic";

export default async function FacturaAlegraPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cargada = await cargarFacturaMigrada(id);
  if (!cargada) notFound();

  const { factura, proforma, sucursal } = cargada;
  // La cabecera migrada no siempre cuadra al centavo (arrastre de Alegra):
  // se enseña la nota en vez de esconder la diferencia, mismo criterio que
  // `detalle-compra-migrada.tsx`. Ver `descuadre-alegra.ts` para por qué la
  // fórmula resta el `discount`.
  const descuadre = hayDescuadreAlegra(factura);

  return (
    <div className="mx-auto max-w-3xl py-2">
      <PageHeader
        title={`Factura ${factura.ncf ?? "s/n"}`}
        titleBadge={<Badge tone="info">Factura migrada de Alegra</Badge>}
        description={`${factura.clientName || "Cliente sin nombre"} · ${formatDate(factura.date)} · Pago: ${etiquetaPagoAlegra(factura.paymentMethod)}`}
        breadcrumbs={[{ label: "Ventas", href: "/ventas" }, { label: factura.ncf ?? id }]}
        actions={
          <>
            {factura.clientId ? (
              <Link href={`/clientes/${factura.clientId}`}>
                <Button variant="outline" size="sm">
                  <ArrowLeft className="h-4 w-4" />
                  Volver al cliente
                </Button>
              </Link>
            ) : (
              <BotonVolver />
            )}
            <Link href={`/ventas/alegra/${id}/print?auto=1`} target="_blank">
              <Button size="sm">
                <Printer className="h-4 w-4" />
                Imprimir
              </Button>
            </Link>
          </>
        }
      />

      {descuadre && (
        <p className="mx-auto mb-4 max-w-[80mm] text-center text-xs opacity-60">
          Subtotal − descuento + ITBIS no coincide exactamente con el total.
          La diferencia viene arrastrada de la migración de Alegra; manda el
          total de la factura.
        </p>
      )}

      <div className="flex justify-center">
        <Receipt80mm proforma={proforma} sucursal={sucursal} preview />
      </div>
    </div>
  );
}
