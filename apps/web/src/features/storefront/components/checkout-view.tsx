"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, ShoppingBag } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import type { CartSummary } from "../cart";
import type { PublicBranch } from "../types";
import { useCart } from "./cart-provider";

/**
 * Confirmar el pedido.
 *
 * Los importes que se ven aquí vienen del SERVIDOR (`/api/storefront/cart`),
 * igual que en el carrito, y el pedido se crea con otra llamada que vuelve a
 * calcularlos: el navegador nunca decide lo que se cobra, ni siquiera en el
 * último paso.
 *
 * Solo hay RETIRO EN SUCURSAL: no se piden direcciones.
 */
export function CheckoutView({
  branches,
  prefill,
  cardPaymentsEnabled = false,
}: {
  branches: PublicBranch[];
  /** Si el cliente entró con su cuenta, no tiene que reescribir sus datos. */
  prefill?: { name: string; phone: string; email: string };
  /**
   * ¿Hay pasarela de verdad detrás? Lo decide el SERVIDOR. Por defecto `false`
   * para que un olvido en el llamador no produzca una promesa de cobro.
   */
  cardPaymentsEnabled?: boolean;
}) {
  const router = useRouter();
  const { items, mounted, clear } = useCart();
  const [resumen, setResumen] = React.useState<CartSummary | null>(null);
  const [enviando, setEnviando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Se genera UNA vez por montaje: es lo que hace que un doble clic —o un
  // reintento tras un fallo de red— no cree dos pedidos.
  const idempotencyKey = React.useRef<string>("");
  if (!idempotencyKey.current && typeof crypto !== "undefined") {
    idempotencyKey.current = crypto.randomUUID();
  }

  React.useEffect(() => {
    if (!mounted || items.length === 0) return;
    let cancelado = false;
    fetch("/api/storefront/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: CartSummary) => {
        if (!cancelado) setResumen(d);
      })
      .catch(() => {
        if (!cancelado) setError("No pudimos calcular tu pedido. Recarga la página.");
      });
    return () => {
      cancelado = true;
    };
  }, [items, mounted]);

  async function enviar(formData: FormData) {
    setEnviando(true);
    setError(null);
    try {
      const resp = await fetch("/api/storefront/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          branchSlug: formData.get("branchSlug"),
          contactName: formData.get("contactName"),
          contactPhone: formData.get("contactPhone"),
          contactEmail: formData.get("contactEmail") || undefined,
          notes: formData.get("notes") || undefined,
          idempotencyKey: idempotencyKey.current,
        }),
      });
      const datos = await resp.json();
      if (!resp.ok) {
        setError(datos?.error ?? "No pudimos registrar tu pedido.");
        return;
      }
      // El carrito se vacía SOLO cuando el pedido existe de verdad. Vaciarlo
      // antes y que fallara la llamada dejaría al cliente sin carrito y sin
      // pedido.
      clear();
      router.push(`/tienda/pedido/${datos.token}`);
    } catch {
      setError("No pudimos registrar tu pedido. Inténtalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  if (!mounted) {
    return (
      <p className="py-20 text-center text-sm text-[color:var(--brand-fg)]/60">
        Cargando…
      </p>
    );
  }

  if (items.length === 0 || (resumen && resumen.lines.length === 0)) {
    return (
      <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-14 text-center">
        <ShoppingBag
          aria-hidden
          className="mx-auto h-10 w-10 text-[color:var(--brand-fg)]/30"
        />
        <p className="mt-4 font-semibold text-[color:var(--brand-fg)]">
          No hay nada que pedir
        </p>
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
    <form action={enviar} className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-4 rounded-2xl border border-black/5 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--brand-fg)]/50">
          Tus datos
        </h2>

        {error ? (
          <p
            role="alert"
            className="rounded-xl bg-[color:var(--brand-warn)]/10 px-4 py-3 text-sm text-[color:var(--brand-fg)]/80"
          >
            {error}
          </p>
        ) : null}

        <div>
          <label
            htmlFor="contactName"
            className="text-sm font-medium text-[color:var(--brand-fg)]"
          >
            Nombre y apellido
          </label>
          <input
            id="contactName"
            name="contactName"
            required
            defaultValue={prefill?.name}
            autoComplete="name"
            className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm"
          />
        </div>

        <div>
          <label
            htmlFor="contactPhone"
            className="text-sm font-medium text-[color:var(--brand-fg)]"
          >
            Teléfono
          </label>
          <input
            id="contactPhone"
            name="contactPhone"
            type="tel"
            required
            defaultValue={prefill?.phone}
            autoComplete="tel"
            className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm"
          />
          <p className="mt-1 text-xs text-[color:var(--brand-fg)]/50">
            Por aquí te avisamos cuando esté listo.
          </p>
        </div>

        <div>
          <label
            htmlFor="contactEmail"
            className="text-sm font-medium text-[color:var(--brand-fg)]"
          >
            Correo <span className="font-normal">(opcional)</span>
          </label>
          <input
            id="contactEmail"
            name="contactEmail"
            type="email"
            defaultValue={prefill?.email}
            autoComplete="email"
            className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm"
          />
        </div>

        <div>
          <label
            htmlFor="branchSlug"
            className="text-sm font-medium text-[color:var(--brand-fg)]"
          >
            Retiras en
          </label>
          <select
            id="branchSlug"
            name="branchSlug"
            required
            className="mt-1 min-h-11 w-full cursor-pointer rounded-xl border border-black/10 bg-white px-3 text-sm"
          >
            {branches.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
                {s.address ? ` — ${s.address}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="notes"
            className="text-sm font-medium text-[color:var(--brand-fg)]"
          >
            Nota <span className="font-normal">(opcional)</span>
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            maxLength={500}
            className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
          />
        </div>
      </div>

      <aside className="h-fit rounded-2xl border border-black/5 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--brand-fg)]/50">
          Tu pedido
        </h2>

        <ul className="mt-3 space-y-2">
          {(resumen?.lines ?? []).map((l) => (
            <li
              key={l.product.slug}
              className="flex justify-between gap-3 text-sm"
            >
              <span className="min-w-0 text-[color:var(--brand-fg)]/80">
                {l.qty} × {l.product.title}
              </span>
              <span className="shrink-0 font-medium text-[color:var(--brand-fg)]">
                {formatCurrency(l.lineTotal)}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-baseline justify-between border-t border-black/5 pt-4">
          <span className="text-sm text-[color:var(--brand-fg)]/70">Total</span>
          <span className="text-2xl font-bold text-[color:var(--brand-fg)]">
            {resumen ? formatCurrency(resumen.total) : "…"}
          </span>
        </div>
        <p className="mt-1 text-xs text-[color:var(--brand-fg)]/50">
          Precios con ITBIS incluido
        </p>

        <button
          type="submit"
          disabled={enviando || !resumen}
          className="mt-6 inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[color:var(--brand-primary)] px-6 text-base font-semibold text-white hover:bg-[color:var(--brand-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)] focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-50"
        >
          {enviando ? (
            <>
              <Loader2 aria-hidden className="h-5 w-5 animate-spin" />
              Enviando…
            </>
          ) : (
            "Enviar pedido"
          )}
        </button>

        {/* La verdad, no una promesa. El texto lo decide el servidor según haya
            o no pasarela activa: mientras no la haya, aquí NUNCA aparece nada
            que parezca un cobro. */}
        <p className="mt-3 text-xs text-[color:var(--brand-fg)]/60">
          {cardPaymentsEnabled
            ? "Después de enviar el pedido podrás pagarlo con tarjeta."
            : "Te confirmamos disponibilidad por teléfono y pagas al retirar en sucursal."}
        </p>
      </aside>
    </form>
  );
}
