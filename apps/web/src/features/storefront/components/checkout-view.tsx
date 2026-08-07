"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, MapPin, ShoppingBag } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import { formatDominicanPhone } from "@/lib/utils/formatters";
import type { CartSummary } from "../cart";
import { initialFulfillment } from "../checkout-fulfillment";
import type { DeliverableProvince } from "../shipping/quote";
import { formatAccountNumber } from "../payments/receipt";

export interface BankAccountView {
  id: string;
  bankName: string;
  accountType: string;
  accountNumber: string;
  holderName: string;
  holderDocument?: string;
}
import type { PublicBranch } from "../types";
import { useCart } from "./cart-provider";

/**
 * UUID v4 con respaldo.
 *
 * `crypto.randomUUID` solo existe en contexto seguro; en el navegador embebido
 * de Instagram o WhatsApp puede no estar. Sin respaldo, el pedido se rechazaría
 * con un error que no explica nada.
 */
function uuidV4(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const h = "0123456789abcdef";
  const d = Array.from({ length: 36 }, () => h[Math.floor(Math.random() * 16)]!);
  d[8] = d[13] = d[18] = d[23] = "-";
  d[14] = "4";
  d[19] = h[8 + Math.floor(Math.random() * 4)]!;
  return d.join("");
}

/**
 * Confirmar el pedido.
 *
 * Los importes que se ven aquí vienen del SERVIDOR (`/api/storefront/cart`),
 * igual que en el carrito, y el pedido se crea con otra llamada que vuelve a
 * calcularlos: el navegador nunca decide lo que se cobra, ni siquiera en el
 * último paso.
 *
 * Es el ÚNICO sitio donde se decide cómo se recibe el pedido: retiro en
 * sucursal o envío a domicilio, con su provincia, su sector y su flete.
 */
export function CheckoutView({
  branches,
  prefill,
  recognized = false,
  cardPaymentsEnabled = false,
  provinces = [],
  bankAccounts = [],
}: {
  branches: PublicBranch[];
  /**
   * Datos que ya sabemos de él: de su cuenta, o de su último pedido desde este
   * mismo dispositivo. Incluye la dirección solo si aquel fue un envío.
   */
  prefill?: {
    name: string;
    phone: string;
    email: string;
    provinceSlug?: string;
    sector?: string;
    address?: string;
    reference?: string;
  };
  /**
   * `true` cuando se le reconoció por el dispositivo (no por haber entrado con
   * su cuenta). Solo entonces tiene sentido ofrecerle "no soy yo".
   */
  recognized?: boolean;
  /**
   * ¿Hay pasarela de verdad detrás? Lo decide el SERVIDOR. Por defecto `false`
   * para que un olvido en el llamador no produzca una promesa de cobro.
   */
  cardPaymentsEnabled?: boolean;
  /**
   * Provincias a las que SÍ se envía, con su precio. Vacío = solo retiro, y por
   * defecto vacío: sin configurar, no se promete un domicilio.
   */
  provinces?: DeliverableProvince[];
  /**
   * Cuentas del negocio para transferir. Vacío = no se ofrece transferencia:
   * pedirle a alguien que transfiera sin decirle a dónde es una vía muerta.
   */
  bankAccounts?: BankAccountView[];
}) {
  const router = useRouter();
  const { items, mounted, clear } = useCart();
  const [resumen, setResumen] = React.useState<CartSummary | null>(null);
  const [enviando, setEnviando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // SIN preselección cuando hay envío configurado.
  //
  // Esto ya causó un pedido mal guardado: el selector arrancaba en "Retiro" y
  // quien no lo tocaba mandaba su pedido como retiro sin enterarse. Elegir cómo
  // recibes lo que compras tiene que ser un acto, no un descuido.
  //
  // ⚠️ La corrección de v0.127.0 tocó las CUATRO ramas que miran `null` pero se
  // dejó esta línea sin cambiar, así que `entrega` nunca podía ser `null` y el
  // fallo seguía vivo con la pantalla ya escrita para evitarlo. TypeScript no
  // lo vio: comparar contra `null` está permitido aunque el tipo no lo incluya.
  //
  // Si no hay ninguna provincia con tarifa, solo existe el retiro y no hay nada
  // que elegir: ahí sí se preselecciona.
  const [entrega, setEntrega] = React.useState<"pickup" | "delivery" | null>(
    () => initialFulfillment(provinces.length),
  );
  const [provincia, setProvincia] = React.useState(prefill?.provinceSlug ?? "");
  // Efectivo por defecto: es lo que funcionaba antes de existir la
  // transferencia, y lo que sigue si el negocio no puso ninguna cuenta.
  const [metodoPago, setMetodoPago] = React.useState<"efectivo" | "transferencia">(
    "efectivo",
  );

  // TODO lo que teclea el cliente vive en estado, no en el DOM.
  //
  // React 19 RESETEA el formulario al terminar una `action`, también cuando
  // falla. Con `defaultValue` eso vaciaba el formulario entero ante cualquier
  // rechazo del servidor: el cliente se quedaba mirando campos en blanco sin
  // saber qué había hecho mal. Controlado, no se pierde nada nunca.
  const [nombre, setNombre] = React.useState(prefill?.name ?? "");
  const [telefono, setTelefono] = React.useState(
    formatDominicanPhone(prefill?.phone ?? ""),
  );
  const [correo, setCorreo] = React.useState(prefill?.email ?? "");
  // La dirección solo viene puesta si su último pedido fue un envío: rellenar
  // un domicilio en alguien que siempre retira sería sacarse un dato de la
  // manga.
  const [sector, setSector] = React.useState(prefill?.sector ?? "");
  const [direccion, setDireccion] = React.useState(prefill?.address ?? "");
  const [referencia, setReferencia] = React.useState(prefill?.reference ?? "");

  // Ubicación del cliente. `null` = no compartida, y es un estado legítimo:
  // el pedido se completa igual con la dirección escrita.
  const [coords, setCoords] = React.useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [ubicacionEstado, setUbicacionEstado] = React.useState<
    "inicial" | "pidiendo" | "listo" | "denegado" | "fallo"
  >("inicial");

  const compartirUbicacion = React.useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setUbicacionEstado("fallo");
      return;
    }
    setUbicacionEstado("pidiendo");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setUbicacionEstado("listo");
      },
      (err) => {
        // Distinguir "dijo que no" de "no se pudo" importa: al primero no hay
        // que insistirle, al segundo se le puede sugerir reintentar.
        setUbicacionEstado(err.code === err.PERMISSION_DENIED ? "denegado" : "fallo");
      },
      // 10 s y sin caché: una posición de hace media hora puede ser de otro
      // sitio, y para una entrega eso es peor que no tener ninguna.
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }, []);
  const [nota, setNota] = React.useState("");
  const [sucursal, setSucursal] = React.useState(branches[0]?.slug ?? "");

  // El flete lo pone la lista que mandó el SERVIDOR, no un número del
  // formulario: el total que se cobra se recalcula igualmente al crear el
  // pedido, pero lo que se enseña aquí tiene que coincidir.
  const envio =
    entrega === "delivery"
      ? (provinces.find((p) => p.slug === provincia)?.cost ?? null)
      : entrega === "pickup"
        ? 0
        : null;
  const totalConEnvio =
    resumen && envio !== null ? resumen.total + envio : (resumen?.total ?? 0);

  // Se genera UNA vez por montaje: es lo que hace que un doble clic —o un
  // reintento tras un fallo de red— no cree dos pedidos.
  // `useState` con inicializador perezoso y NO asignación en render: asignar en
  // render es impuro y se ejecuta dos veces con StrictMode.
  //
  // `crypto.randomUUID` **solo existe en contexto seguro**, y esta tienda se
  // promociona por Instagram y WhatsApp, cuyos navegadores embebidos son
  // justo donde eso falla. Sin respaldo, o revienta el render o manda una clave
  // vacía que el servidor rechaza con un error que no dice nada.
  const [idempotencyKey] = React.useState(() => uuidV4());

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

  /**
   * "No soy yo": vacía el formulario y borra la galleta.
   *
   * Se borra en el SERVIDOR y no con `document.cookie` porque es `httpOnly` —el
   * JavaScript de la página no la ve, que es justo lo que la protege de un XSS.
   */
  async function olvidarme() {
    setNombre("");
    setTelefono("");
    setCorreo("");
    setProvincia("");
    setSector("");
    setDireccion("");
    setReferencia("");
    try {
      await fetch("/api/storefront/olvidarme", { method: "POST" });
    } catch {
      // Los campos ya están vacíos; que la galleta siga ahí solo significa que
      // volverá a proponer los datos la próxima vez.
    }
    router.refresh();
  }

  async function enviar() {
    if (entrega === null) {
      setError("Elige si lo retiras en sucursal o te lo llevamos.");
      return;
    }
    if (entrega === "delivery" && envio === null) {
      setError("Elige tu provincia para calcular el envío.");
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const resp = await fetch("/api/storefront/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          fulfillment: entrega,
          paymentMethod: metodoPago,
          branchSlug: sucursal,
          province: provincia,
          sector,
          address: direccion,
          reference: referencia || undefined,
          // Solo si el cliente la compartió. El servidor las valida otra vez y
          // las descarta si no son coordenadas terrestres.
          deliveryLat: coords?.lat,
          deliveryLng: coords?.lng,
          contactName: nombre,
          contactPhone: telefono,
          contactEmail: correo || undefined,
          notes: nota || undefined,
          idempotencyKey,
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

        {/* Se le reconoció por el dispositivo, así que se dice y se ofrece la
            salida. Rellenar el formulario con los datos de otro sin avisar es
            lo que pasa cuando la computadora es compartida. */}
        {recognized ? (
          <p className="flex flex-wrap items-center gap-2 rounded-xl bg-[color:var(--brand-primary)]/5 px-4 py-3 text-sm text-[color:var(--brand-fg)]/80">
            <span>
              Hola de nuevo{prefill?.name ? `, ${prefill.name.split(" ")[0]}` : ""}.
              Pusimos tus datos de la última vez.
            </span>
            <button
              type="button"
              onClick={olvidarme}
              className="cursor-pointer font-semibold text-[color:var(--brand-primary)] underline underline-offset-4"
            >
              No soy yo
            </button>
          </p>
        ) : null}

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
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
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
            value={telefono}
            // Misma máscara que el ERP: el cliente escribe dígitos y salen los
            // guiones solos. El servidor acepta también el "+1" que produce.
            onChange={(e) => setTelefono(formatDominicanPhone(e.target.value))}
            placeholder="809-555-0000"
            inputMode="tel"
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
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            autoComplete="email"
            className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm"
          />
        </div>

        {/* Retiro o envío. Solo se ofrece envío si el negocio configuró alguna
            provincia: prometer un domicilio al que no se llega es peor que no
            ofrecerlo. */}
        {provinces.length > 0 ? (
          <fieldset>
            <legend className="text-sm font-medium text-[color:var(--brand-fg)]">
              ¿Cómo lo recibes?
            </legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["pickup", "Retiro en sucursal", "Sin costo"],
                  ["delivery", "Envío a domicilio", "Según la provincia"],
                ] as const
              ).map(([valor, titulo, nota]) => (
                <label
                  key={valor}
                  className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 ${
                    entrega === valor
                      ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]/5"
                      : "border-black/10 bg-white"
                  }`}
                >
                  <input
                    type="radio"
                    name="fulfillment"
                    value={valor}
                    checked={entrega === valor}
                    onChange={() => setEntrega(valor)}
                    className="mt-0.5 h-4 w-4 cursor-pointer"
                  />
                  <span>
                    <span className="block text-sm font-medium text-[color:var(--brand-fg)]">
                      {titulo}
                    </span>
                    <span className="block text-xs text-[color:var(--brand-fg)]/60">
                      {nota}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {entrega === null ? (
          <p className="rounded-xl bg-[color:var(--brand-warn)]/10 px-4 py-3 text-sm text-[color:var(--brand-fg)]/80">
            Elige arriba cómo quieres recibir tu pedido para continuar.
          </p>
        ) : entrega === "pickup" ? (
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
              value={sucursal}
              onChange={(e) => setSucursal(e.target.value)}
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
        ) : (
          <>
            <div>
              <label
                htmlFor="province"
                className="text-sm font-medium text-[color:var(--brand-fg)]"
              >
                Provincia
              </label>
              <select
                id="province"
                name="province"
                required
                value={provincia}
                onChange={(e) => setProvincia(e.target.value)}
                className="mt-1 min-h-11 w-full cursor-pointer rounded-xl border border-black/10 bg-white px-3 text-sm"
              >
                <option value="">Elige tu provincia…</option>
                {provinces.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.name} — {formatCurrency(p.cost)}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-[color:var(--brand-fg)]/50">
                El costo del envío depende de la provincia.
              </p>
            </div>

            <div>
              <label
                htmlFor="sector"
                className="text-sm font-medium text-[color:var(--brand-fg)]"
              >
                Sector
              </label>
              <input
                id="sector"
                name="sector"
                required
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                maxLength={120}
                placeholder="Ej.: Los Jardines, Cerros de Gurabo…"
                className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="address"
                className="text-sm font-medium text-[color:var(--brand-fg)]"
              >
                Dirección
              </label>
              <input
                id="address"
                name="address"
                required
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
                maxLength={300}
                autoComplete="street-address"
                placeholder="Calle, número, edificio, apartamento"
                className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="reference"
                className="text-sm font-medium text-[color:var(--brand-fg)]"
              >
                Referencia <span className="font-normal">(opcional)</span>
              </label>
              <input
                id="reference"
                name="reference"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                maxLength={300}
                placeholder="Ej.: casa amarilla, frente al colmado"
                className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm"
              />
            </div>

            {/* Ubicación exacta. En Santiago hay calles sin número y sectores
                donde la dirección real es "la casa verde al lado del colmado":
                un punto en el mapa le ahorra al repartidor la llamada.

                Es OPCIONAL y se pide con un botón, nunca al cargar la página:
                un permiso de ubicación que salta solo asusta y se deniega. La
                dirección escrita sigue siendo obligatoria. */}
            <div className="rounded-xl border border-black/10 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[color:var(--brand-fg)]">
                    Tu ubicación <span className="font-normal">(opcional)</span>
                  </p>
                  <p className="mt-0.5 text-xs opacity-70">
                    Ayuda al mensajero a llegar sin llamarte.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={compartirUbicacion}
                  disabled={ubicacionEstado === "pidiendo"}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[color:var(--brand-primary)]/30 px-4 text-sm font-semibold text-[color:var(--brand-primary)] transition-colors hover:bg-[color:var(--brand-primary)]/5 disabled:opacity-60"
                >
                  <MapPin aria-hidden className="h-4 w-4" />
                  {ubicacionEstado === "pidiendo"
                    ? "Obteniendo…"
                    : coords
                      ? "Actualizar"
                      : "Usar mi ubicación"}
                </button>
              </div>

              {coords ? (
                <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-emerald-700">
                  <span>✓ Ubicación compartida.</span>
                  <button
                    type="button"
                    onClick={() => {
                      setCoords(null);
                      setUbicacionEstado("inicial");
                    }}
                    className="underline underline-offset-2 hover:no-underline"
                  >
                    Quitar
                  </button>
                </p>
              ) : null}

              {ubicacionEstado === "denegado" ? (
                <p className="mt-2 text-xs opacity-70">
                  No diste permiso. No pasa nada: llegamos con la dirección que
                  escribiste.
                </p>
              ) : null}
              {ubicacionEstado === "fallo" ? (
                <p className="mt-2 text-xs opacity-70">
                  No pudimos obtener tu ubicación. Sigue con la dirección
                  escrita.
                </p>
              ) : null}
            </div>
          </>
        )}

        {bankAccounts.length > 0 ? (
          <fieldset>
            <legend className="text-sm font-medium text-[color:var(--brand-fg)]">
              ¿Cómo pagas?
            </legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {(
                [
                  [
                    "efectivo",
                    entrega === "delivery" ? "Al recibirlo" : "Al retirarlo",
                    "En efectivo",
                  ],
                  [
                    "transferencia",
                    "Transferencia bancaria",
                    "Subes el comprobante después",
                  ],
                ] as const
              ).map(([valor, titulo, nota]) => (
                <label
                  key={valor}
                  className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 ${
                    metodoPago === valor
                      ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]/5"
                      : "border-black/10 bg-white"
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value={valor}
                    checked={metodoPago === valor}
                    onChange={() => setMetodoPago(valor)}
                    className="mt-0.5 h-4 w-4 cursor-pointer"
                  />
                  <span>
                    <span className="block text-sm font-medium text-[color:var(--brand-fg)]">
                      {titulo}
                    </span>
                    <span className="block text-xs text-[color:var(--brand-fg)]/60">
                      {nota}
                    </span>
                  </span>
                </label>
              ))}
            </div>

            {metodoPago === "transferencia" ? (
              <div className="mt-3 rounded-xl bg-[color:var(--brand-primary)]/5 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--brand-fg)]/60">
                  Transfiere a
                </p>
                <ul className="mt-2 space-y-3">
                  {bankAccounts.map((c) => (
                    <li key={c.id} className="text-sm">
                      <span className="font-semibold text-[color:var(--brand-fg)]">
                        {c.bankName}
                      </span>{" "}
                      <span className="text-[color:var(--brand-fg)]/60">
                        · {c.accountType}
                      </span>
                      <span className="block font-mono text-[color:var(--brand-fg)]">
                        {formatAccountNumber(c.accountNumber)}
                      </span>
                      <span className="block text-xs text-[color:var(--brand-fg)]/60">
                        {c.holderName}
                        {c.holderDocument ? ` · ${c.holderDocument}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-[color:var(--brand-fg)]/70">
                  Al enviar el pedido te damos un enlace para subir el
                  comprobante. Preparamos el pedido cuando lo confirmemos.
                </p>
              </div>
            ) : null}
          </fieldset>
        ) : null}

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
            value={nota}
            onChange={(e) => setNota(e.target.value)}
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

        {entrega === "delivery" ? (
          <div className="mt-4 flex items-baseline justify-between border-t border-black/5 pt-4 text-sm">
            <span className="text-[color:var(--brand-fg)]/70">Envío</span>
            <span className="font-medium text-[color:var(--brand-fg)]">
              {envio === null ? "Elige provincia" : formatCurrency(envio)}
            </span>
          </div>
        ) : null}

        <div className="mt-4 flex items-baseline justify-between border-t border-black/5 pt-4">
          <span className="text-sm text-[color:var(--brand-fg)]/70">Total</span>
          <span className="text-2xl font-bold text-[color:var(--brand-fg)]">
            {resumen ? formatCurrency(totalConEnvio) : "…"}
          </span>
        </div>
        <p className="mt-1 text-xs text-[color:var(--brand-fg)]/50">
          Precios con ITBIS incluido
        </p>

        {/* Un botón muerto sin explicación es lo peor que puede pasarle a quien
            intenta comprar: pulsa y no ocurre nada. En móvil este panel va
            DEBAJO del formulario, así que el motivo tiene que estar aquí. */}
        {entrega === null ? (
          <p className="mt-4 rounded-xl bg-[color:var(--brand-warn)]/10 px-3 py-2 text-sm text-[color:var(--brand-fg)]/80">
            Elige cómo lo recibes para poder continuar.
          </p>
        ) : entrega === "delivery" && envio === null ? (
          <p className="mt-4 rounded-xl bg-[color:var(--brand-warn)]/10 px-3 py-2 text-sm text-[color:var(--brand-fg)]/80">
            Elige tu provincia para poder continuar.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={enviando || !resumen || entrega === null}
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
            : entrega === "delivery"
              ? "Te contactamos para coordinar la entrega y pagas al recibirlo."
              : entrega === "pickup"
                ? "Te contactamos cuando esté listo y pagas al retirarlo."
                : "Elige arriba cómo quieres recibir tu pedido."}
        </p>
      </aside>
    </form>
  );
}
