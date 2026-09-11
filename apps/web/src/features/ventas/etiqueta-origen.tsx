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
  // 🔴 Falla CERRADA: solo se marca lo que se sabe migrado. Preguntar por
  // `!== "sistema"` hacía que un `origen` ausente —una respuesta vieja en
  // caché, un JSON incompleto— pintara «Migrada de Alegra» sobre una venta del
  // sistema, y entonces la etiqueta deja de avisar de nada.
  if (origen !== "alegra") {
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

/**
 * Etiqueta de una FILA YA FUNDIDA (sucursal, vendedor, comprobante…), que
 * puede traer una fuente o las dos sumadas.
 *
 * 🔴 «TODO DEBE ESTAR UNIFICADO... SOLO UN LETRERO PARA IDENTIFICAR QUE VINO
 * DE ALEGRA» (pedido del dueño, 10/09/2026): antes, una sucursal o un
 * vendedor con ventas en los dos sistemas salían en DOS filas —una por
 * origen, cada una con su propia etiqueta—, y «DermaLand Principal» o
 * «Desteny Reynoso» parecían dos cosas distintas. Ahora la fila ya viene
 * fundida en una sola (`fundirPorClave`) y esto pinta UN solo letrero según
 * de dónde salió el dinero: nada si es solo del sistema (lo normal, marcarlo
 * sería ruido), «Migrada de Alegra» si es solo histórico (como antes, no se
 * puede editar), y un tercer texto —ni uno ni el otro— cuando el total de la
 * fila suma las dos fuentes: decir «Migrada de Alegra» ahí sería falso (parte
 * SÍ se puede editar) y no decir nada escondería que una parte del número no
 * se puede tocar.
 */
export function EtiquetaOrigenes({ origenes }: { origenes: readonly OrigenVenta[] }) {
  const tieneAlegra = origenes.includes("alegra");
  const tieneSistema = origenes.includes("sistema");
  if (!tieneAlegra) return null;
  if (tieneSistema) {
    return (
      <Badge
        tone="info"
        title="Esta fila suma ventas del sistema y del histórico migrado de Alegra."
      >
        <Archive className="h-3 w-3" aria-hidden />
        Incluye histórico de Alegra
      </Badge>
    );
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
