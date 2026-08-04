import { Check } from "lucide-react";
import {
  buildOrderTimeline,
  type Fulfillment,
} from "../orders/timeline";
import type { WebOrderStatus } from "../orders/status";

/**
 * Por dónde va el pedido.
 *
 * El estado no se dice solo con color: cada paso lleva su texto, y el actual
 * además va en negrita y con `aria-current`. Un punto verde y otro gris no le
 * dicen nada a quien no distingue esos dos grises.
 *
 * Server Component: el estado lo sabe el servidor y no cambia mientras el
 * cliente mira la página. No hay nada que hidratar.
 */
export function OrderTimeline({
  status,
  fulfillment,
}: {
  status: WebOrderStatus;
  fulfillment: Fulfillment;
}) {
  const pasos = buildOrderTimeline(status, fulfillment);
  if (pasos.length === 0) return null;

  return (
    <ol className="mt-6 space-y-0">
      {pasos.map((paso, i) => {
        const ultimo = i === pasos.length - 1;
        return (
          <li
            key={paso.key}
            aria-current={paso.current ? "step" : undefined}
            className="flex gap-3"
          >
            <div className="flex flex-col items-center">
              <span
                aria-hidden
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${
                  paso.done
                    ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)] text-white"
                    : "border-black/15 bg-white"
                }`}
              >
                {paso.done ? <Check className="h-4 w-4" /> : null}
              </span>
              {/* La línea que une los puntos, salvo bajo el último. */}
              {!ultimo ? (
                <span
                  aria-hidden
                  className={`w-0.5 flex-1 ${
                    paso.done && !paso.current
                      ? "bg-[color:var(--brand-primary)]"
                      : "bg-black/10"
                  }`}
                />
              ) : null}
            </div>

            <div className={ultimo ? "pb-0 pt-0.5" : "pb-6 pt-0.5"}>
              <p
                className={
                  paso.current
                    ? "text-sm font-bold text-[color:var(--brand-fg)]"
                    : paso.done
                      ? "text-sm text-[color:var(--brand-fg)]/70"
                      : "text-sm text-[color:var(--brand-fg)]/40"
                }
              >
                {paso.label}
                {paso.current ? (
                  <span className="ml-2 text-xs font-normal text-[color:var(--brand-primary)]">
                    · ahora
                  </span>
                ) : null}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
