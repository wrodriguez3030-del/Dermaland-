"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  nextStatuses,
  webOrderStatusLabel,
  type WebOrderStatus,
} from "../orders/status";

/**
 * Botones para mover un pedido de estado, en la pantalla del ERP.
 *
 * Solo se pintan las transiciones que la máquina de estados permite — pero el
 * servidor las vuelve a validar: no puede fiarse de que el botón que llegó sea
 * uno de los que él pintó.
 *
 * Cancelar pide motivo. Es lo único irreversible de esta pantalla y sin motivo
 * el registro de auditoría no le sirve a nadie dentro de seis meses.
 */
export function OrderStatusActions({
  orderId,
  status,
}: {
  orderId: string;
  status: WebOrderStatus;
}) {
  const router = useRouter();
  const [enviando, setEnviando] = React.useState<WebOrderStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const opciones = nextStatuses(status);
  if (opciones.length === 0) return null;

  async function mover(a: WebOrderStatus) {
    let motivo: string | undefined;
    if (a === "cancelado") {
      const escrito = window.prompt("¿Por qué se cancela este pedido?");
      // Cancelar sin motivo no se hace: se sale sin tocar nada.
      if (!escrito?.trim()) return;
      motivo = escrito.trim();
    }

    setEnviando(a);
    setError(null);
    try {
      const resp = await fetch(`/api/pedidos-web/${orderId}/estado`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: a, reason: motivo }),
      });
      if (!resp.ok) {
        const datos = await resp.json().catch(() => null);
        setError(datos?.error ?? "No se pudo cambiar el estado.");
        return;
      }
      router.refresh();
    } catch {
      setError("No se pudo cambiar el estado.");
    } finally {
      setEnviando(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {opciones.map((a) => {
          const destructiva = a === "cancelado";
          return (
            <button
              key={a}
              type="button"
              disabled={enviando !== null}
              onClick={() => mover(a)}
              className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-5 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-50 ${
                destructiva
                  ? "border border-red-300 bg-white text-red-700 hover:bg-red-50 focus-visible:ring-red-400"
                  : "bg-[color:var(--brand-primary)] text-white hover:bg-[color:var(--brand-accent)] focus-visible:ring-[color:var(--brand-accent)]"
              }`}
            >
              {enviando === a ? (
                <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
              ) : null}
              {destructiva ? "Cancelar pedido" : webOrderStatusLabel(a)}
            </button>
          );
        })}
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
