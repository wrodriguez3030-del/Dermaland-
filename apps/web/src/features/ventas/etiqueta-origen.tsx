import { Badge } from "@/components/ui";
import { Archive } from "lucide-react";
import type { OrigenVenta } from "./venta-unificada";

/**
 * Etiqueta que indica el origen de una venta.
 *
 * - Ventas del sistema: sin etiqueta (es lo normal, marcarlas sería ruido).
 * - Ventas de Alegra: etiqueta pequeña que dice que es histórico y no editable.
 *
 * La etiqueta se usa en cuatro sitios: panel, reportes, ficha del cliente
 * y cuentas por cobrar, para que el dueño sepa de dónde viene cada venta.
 *
 * El texto visible debe comunicar que es histórico, no solo el nombre del
 * sistema: en tabletas no hay hover, así que el title no se ve.
 */
export function EtiquetaOrigen({ origen }: { origen: OrigenVenta }) {
  if (origen === "sistema") {
    return null;
  }

  return (
    <Badge
      tone="info"
      title="Venta migrada del sistema anterior (Alegra). No se puede editar."
    >
      <Archive className="h-3 w-3" aria-hidden />
      Migrada de Alegra
    </Badge>
  );
}
