"use client";

import * as React from "react";
import { skinTypeOptions } from "./billing";
import type { CustomerSkinType } from "@/types";

/**
 * Tipo de piel, editable desde el propio listado.
 *
 * Antes era una insignia de solo lectura: para anotar la piel de una clienta
 * había que entrar a su ficha, pulsar «Editar», guardar y volver — cuatro pasos
 * y perder el sitio en la lista. Con 6 525 fichas casi todas «No especificado»,
 * ese roce es la diferencia entre que el dato se llene y que no se llene nunca.
 *
 * 🔴 Guarda al soltar el desplegable, sin botón. Y con vuelta atrás: si el
 * servidor dice que no, el valor VUELVE al anterior y se avisa. Dejarlo puesto
 * en pantalla sin haberse guardado es peor que no dejar cambiarlo, porque quien
 * lo hizo se va creyendo que quedó anotado.
 */
export function SelectorTipoPiel({
  clienteId,
  valor,
  onGuardado,
  onError,
}: {
  clienteId: string;
  valor: CustomerSkinType;
  /** Se llama con el valor ya confirmado por el servidor. */
  onGuardado?: (nuevo: CustomerSkinType) => void;
  onError?: (mensaje: string) => void;
}) {
  // Lo que se ve. Se adelanta al servidor para que el desplegable no parpadee,
  // y se revierte si la petición falla.
  const [visible, setVisible] = React.useState<CustomerSkinType>(valor);
  const [guardando, setGuardando] = React.useState(false);

  /**
   * 🔴 Solo se obedece al valor de arriba cuando CAMBIA de verdad.
   *
   * La primera versión hacía `if (!guardando) setVisible(valor)`, y eso revertía
   * también los guardados BUENOS: al terminar la petición, el `valor` que llega
   * por props sigue siendo el viejo —la fila no se ha recargado— y el
   * desplegable saltaba atrás solo. El usuario veía su cambio deshacerse sin
   * explicación.
   *
   * Guardando el último `valor` visto, un refresco externo (otra pestaña, una
   * recarga de la lista) sí manda, y un guardado propio no se pisa.
   */
  const valorPrevio = React.useRef(valor);
  React.useEffect(() => {
    if (valor !== valorPrevio.current) {
      valorPrevio.current = valor;
      setVisible(valor);
    }
  }, [valor]);

  async function cambiar(nuevo: CustomerSkinType) {
    if (nuevo === visible) return;
    const anterior = visible;
    setVisible(nuevo);
    setGuardando(true);
    try {
      const res = await fetch(`/api/customers/${encodeURIComponent(clienteId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skinType: nuevo }),
      });
      if (!res.ok) {
        const cuerpo: unknown = await res.json().catch(() => null);
        const msg =
          cuerpo && typeof cuerpo === "object" && "error" in cuerpo && typeof cuerpo.error === "string"
            ? cuerpo.error
            : "No se pudo guardar el tipo de piel.";
        throw new Error(msg);
      }
      onGuardado?.(nuevo);
    } catch (e) {
      // 🔴 Vuelta atrás visible: el usuario tiene que VER que no se guardó.
      setVisible(anterior);
      onError?.(e instanceof Error ? e.message : "No se pudo guardar el tipo de piel.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <select
      aria-label="Tipo de piel"
      className="h-8 max-w-[190px] rounded-lg border border-black/15 bg-white px-2 text-xs disabled:opacity-50"
      value={visible}
      disabled={guardando}
      // La fila entera es un enlace a la ficha: sin esto, desplegar el selector
      // navegaba fuera de la lista.
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => void cambiar(e.target.value as CustomerSkinType)}
    >
      {skinTypeOptions.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
