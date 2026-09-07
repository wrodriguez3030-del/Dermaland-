"use client";

import * as React from "react";
import { formatCurrency } from "@/lib/utils/format";
import type { RenglonAlegra } from "./use-renglones-alegra";

/**
 * Qué llevaba una compra migrada, dentro de su propia fila.
 *
 * El dueño lo pidió así: «el ítem debe verse en esa pantalla; si tiene más
 * ítems, un "ver más" y se visualiza». Antes la columna decía «—» y para saber
 * qué se llevó el cliente había que abrir un modal aparte.
 *
 * Se enseñan las dos primeras líneas y el resto detrás de «ver más»: una
 * compra de quince renglones estiraría la fila hasta hacer ilegible la tabla.
 */
const VISIBLES = 2;

export function CeldaItemsMigrados({
  lineas,
  cargando,
}: {
  lineas: RenglonAlegra[];
  cargando: boolean;
}) {
  const [abierta, setAbierta] = React.useState(false);

  // Cargando no es lo mismo que vacío: decir «0 ítems» mientras la petición
  // está en el aire es afirmar algo que todavía no se sabe.
  if (cargando && lineas.length === 0) {
    return <span className="text-xs opacity-40">…</span>;
  }
  if (lineas.length === 0) {
    return <span className="text-xs opacity-60">—</span>;
  }

  const mostradas = abierta ? lineas : lineas.slice(0, VISIBLES);
  const ocultas = lineas.length - mostradas.length;

  return (
    <div className="text-left text-xs">
      <div className="font-medium tabular-nums">
        {lineas.length} {lineas.length === 1 ? "ítem" : "ítems"}
      </div>
      <ul className="mt-0.5 space-y-0.5">
        {mostradas.map((l, i) => (
          <li key={`${l.invoiceId}-${l.productId ?? i}-${i}`} className="opacity-70">
            {l.quantity > 1 && <span className="tabular-nums">{l.quantity}× </span>}
            {l.name}
            <span className="opacity-60"> · {formatCurrency(l.total)}</span>
          </li>
        ))}
      </ul>
      {(ocultas > 0 || abierta) && (
        <button
          type="button"
          className="mt-0.5 text-[color:var(--brand-primary)] underline underline-offset-2"
          // La fila entera navega a la factura: sin esto, desplegar el detalle
          // se llevaría al usuario fuera de la ficha.
          onClick={(e) => {
            e.stopPropagation();
            setAbierta((v) => !v);
          }}
        >
          {abierta ? "ver menos" : `ver más (${ocultas})`}
        </button>
      )}
    </div>
  );
}
