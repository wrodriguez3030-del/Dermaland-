"use client";

import * as React from "react";
import Link from "next/link";
import { MessageCircle, ShoppingBag, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import { MAX_QTY_PER_LINE, type CartSummary } from "../cart";
import { cartInquiryMessage } from "../cart-message";
import { whatsappLink } from "../contact";
import { useCart } from "./cart-provider";
import { ProductPhoto } from "./product-photo";

/**
 * La pantalla del carrito.
 *
 * Los precios NO se calculan aquí: se piden a `/api/storefront/cart` cada vez
 * que cambia el carrito. Es lo que garantiza que lo que ve el cliente es lo que
 * el negocio cobra, aunque el `localStorage` lleve una semana ahí y entretanto
 * hayan subido un precio o se haya agotado algo.
 *
 * Aquí NO se elige cómo se recibe el pedido. El carrito enseña qué llevas y
 * cuánto vale; retiro o envío, sucursal y dirección los pregunta el checkout,
 * que es donde el flete cambia el total.
 */
export function CartView({
  whatsappPhone,
  baseUrl,
}: {
  whatsappPhone: string | undefined;
  baseUrl: string;
}) {
  const { items, mounted, setQty, remove } = useCart();
  const [resumen, setResumen] = React.useState<CartSummary | null>(null);
  const [cargando, setCargando] = React.useState(false);
  const [falló, setFalló] = React.useState(false);

  React.useEffect(() => {
    if (!mounted) return;
    if (items.length === 0) {
      setResumen({ lines: [], itemCount: 0, total: 0, dropped: [] });
      return;
    }
    let cancelado = false;
    setCargando(true);
    setFalló(false);
    fetch("/api/storefront/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    })
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
      )
      .then((datos: CartSummary) => {
        if (!cancelado) setResumen(datos);
      })
      .catch(() => {
        if (!cancelado) setFalló(true);
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [items, mounted]);

  // Sin sucursal: el carrito ya no la pregunta, así que el mensaje no puede
  // inventarse una. `cartInquiryMessage` lo contempla y omite la línea.
  const mensaje = resumen
    ? cartInquiryMessage({ summary: resumen, branch: undefined, baseUrl })
    : "";
  const enlaceWhatsapp = mensaje ? whatsappLink(whatsappPhone, mensaje) : null;

  // Hasta montar no se sabe qué hay guardado: se enseña un texto neutro, no un
  // "carrito vacío" que parpadearía en cuanto llegara el contenido real.
  if (!mounted || (cargando && !resumen)) {
    return (
      <p
        aria-live="polite"
        className="py-20 text-center text-sm text-[color:var(--brand-fg)]/60"
      >
        Cargando tu carrito…
      </p>
    );
  }

  if (falló) {
    return (
      <p className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-14 text-center text-sm text-[color:var(--brand-fg)]/70">
        No pudimos calcular tu carrito ahora mismo. Recarga la página en un
        momento.
      </p>
    );
  }

  if (!resumen || resumen.lines.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-14 text-center">
        <ShoppingBag
          aria-hidden
          className="mx-auto h-10 w-10 text-[color:var(--brand-fg)]/30"
        />
        <p className="mt-4 font-semibold text-[color:var(--brand-fg)]">
          Tu carrito está vacío
        </p>
        {resumen && resumen.dropped.length > 0 ? (
          <p className="mt-2 text-sm text-[color:var(--brand-fg)]/60">
            Lo que tenías guardado ya no está disponible.
          </p>
        ) : null}
        <Link
          href="/tienda"
          className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-[color:var(--brand-primary)] px-6 text-sm font-semibold text-white hover:bg-[color:var(--brand-accent)]"
        >
          Ver la tienda
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <ul className="divide-y divide-black/5 rounded-2xl border border-black/5 bg-white">
        {resumen.lines.map((linea) => (
          <li key={linea.product.slug} className="flex gap-4 p-4">
            <Link
              href={`/tienda/producto/${linea.product.slug}`}
              className="w-20 shrink-0"
            >
              <ProductPhoto
                src={linea.product.imageUrl}
                alt={linea.product.imageAlt}
                title={linea.product.title}
              />
            </Link>

            <div className="min-w-0 flex-1">
              <Link
                href={`/tienda/producto/${linea.product.slug}`}
                className="text-sm font-semibold text-[color:var(--brand-fg)] hover:text-[color:var(--brand-primary)]"
              >
                {linea.product.title}
              </Link>
              {linea.product.presentation ? (
                <p className="text-xs text-[color:var(--brand-fg)]/60">
                  {linea.product.presentation}
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label
                  htmlFor={`cantidad-${linea.product.slug}`}
                  className="text-xs text-[color:var(--brand-fg)]/60"
                >
                  Cantidad
                </label>
                <select
                  id={`cantidad-${linea.product.slug}`}
                  value={linea.qty}
                  onChange={(e) =>
                    setQty(linea.product.slug, Number(e.target.value))
                  }
                  className="min-h-11 cursor-pointer rounded-lg border border-black/10 bg-white px-3 text-sm"
                >
                  {Array.from(
                    { length: MAX_QTY_PER_LINE },
                    (_, i) => i + 1,
                  ).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => remove(linea.product.slug)}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-lg px-2 text-sm text-[color:var(--brand-fg)]/60 hover:text-[color:var(--brand-primary)]"
                >
                  <Trash2 aria-hidden className="h-4 w-4" />
                  Quitar
                  <span className="sr-only"> {linea.product.title}</span>
                </button>
              </div>
            </div>

            <p className="shrink-0 text-sm font-bold text-[color:var(--brand-fg)]">
              {formatCurrency(linea.lineTotal)}
            </p>
          </li>
        ))}
      </ul>

      <aside className="h-fit rounded-2xl border border-black/5 bg-white p-5">
        {resumen.dropped.length > 0 ? (
          <p className="mb-4 rounded-xl bg-[color:var(--brand-warn)]/10 px-3 py-2 text-xs text-[color:var(--brand-fg)]/80">
            Quitamos {resumen.dropped.length}{" "}
            {resumen.dropped.length === 1 ? "producto" : "productos"} que ya no
            están disponibles.
          </p>
        ) : null}

        <div className="flex items-baseline justify-between">
          <span className="text-sm text-[color:var(--brand-fg)]/70">Total</span>
          <span className="text-2xl font-bold text-[color:var(--brand-fg)]">
            {formatCurrency(resumen.total)}
          </span>
        </div>
        <p className="mt-1 text-xs text-[color:var(--brand-fg)]/50">
          Precios con ITBIS incluido
        </p>

        {/* Aquí NO se elige sucursal. Lo hacía cuando el carrito era el final
            del camino; ahora el checkout pregunta primero cómo lo recibe —
            retiro o envío— y solo después dónde. Preguntarlo dos veces, y en el
            orden equivocado, es peor que no preguntarlo. */}

        {/* El pedido de verdad es la acción principal; WhatsApp queda de
            respaldo porque sigue siendo útil para preguntar antes de comprar. */}
        <Link
          href="/tienda/checkout"
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--brand-primary)] px-6 text-base font-semibold text-white hover:bg-[color:var(--brand-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)] focus-visible:ring-offset-2"
        >
          Continuar con el pedido
        </Link>

        {enlaceWhatsapp ? (
          <a
            href={enlaceWhatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-6 text-sm font-medium text-[color:var(--brand-fg)] hover:border-[color:var(--brand-primary)] hover:text-[color:var(--brand-primary)]"
          >
            <MessageCircle aria-hidden className="h-4 w-4" />
            Preguntar por WhatsApp
          </a>
        ) : null}

        {/* Se dice lo que pasa de verdad. No hay cobro en línea todavía, y
            prometerlo sería mentir. */}
        <p className="mt-3 text-xs text-[color:var(--brand-fg)]/60">
          En el siguiente paso eliges si lo retiras o te lo llevamos.
        </p>
      </aside>
    </div>
  );
}
