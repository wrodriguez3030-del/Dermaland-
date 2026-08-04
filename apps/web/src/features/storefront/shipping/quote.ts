// Cuánto cuesta llevarle el pedido al cliente, y a dónde se llega.
//
// Fail-closed: **una provincia sin tarifa configurada NO se puede enviar**. La
// alternativa —cobrar RD$0 por falta de configuración— es regalar el flete sin
// que nadie se entere hasta ver las cuentas del mes. Que un envío valga cero
// tiene que ser una decisión escrita, no un olvido.
//
// El sector va como texto libre a propósito: en República Dominicana hay miles
// y no existe una lista canónica. La provincia sí es cerrada, porque es la que
// decide el precio.

import { z } from "zod";
import { findProvince, type Province } from "./provinces";

export interface ShippingRate {
  provinceSlug: string;
  /** En DOP. Cero es válido (envío gratis); negativo no. */
  cost: number;
  active: boolean;
}

export type ShippingQuote =
  | { ok: true; cost: number; provinceName: string }
  | { ok: false; error: string };

function tarifaValida(r: ShippingRate): boolean {
  return r.active && Number.isFinite(r.cost) && r.cost >= 0;
}

/** Cuánto cuesta llevarlo a esa provincia, o por qué no se puede. */
export function quoteShipping(
  provinceSlug: string,
  rates: readonly ShippingRate[],
): ShippingQuote {
  const provincia = findProvince(provinceSlug);
  if (!provincia) return { ok: false, error: "Elige una provincia." };

  const tarifa = rates.find((r) => r.provinceSlug === provincia.slug);
  if (!tarifa || !tarifaValida(tarifa)) {
    return {
      ok: false,
      error: `Por ahora no llevamos a ${provincia.name}. Puedes retirar en sucursal.`,
    };
  }

  return { ok: true, cost: tarifa.cost, provinceName: provincia.name };
}

export interface DeliverableProvince extends Province {
  cost: number;
}

/** A dónde SÍ se llega, con su precio, para pintar el desplegable. */
export function deliverableProvinces(
  rates: readonly ShippingRate[],
): DeliverableProvince[] {
  return rates
    .filter(tarifaValida)
    .flatMap((r) => {
      const p = findProvince(r.provinceSlug);
      return p ? [{ ...p, cost: r.cost }] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export interface DeliveryAddress {
  province: string;
  sector: string;
  address: string;
  reference?: string;
}

const DireccionSchema = z.object({
  province: z
    .string({ message: "Elige una provincia." })
    .trim()
    .min(1, "Elige una provincia."),
  sector: z
    .string({ message: "Escribe tu sector." })
    .trim()
    .min(1, "Escribe tu sector.")
    .max(120),
  address: z
    .string({ message: "Escribe tu dirección." })
    .trim()
    .min(1, "Escribe tu dirección.")
    .max(300),
  reference: z.string().trim().max(300).optional(),
});

export type DeliveryAddressResult =
  | { ok: true; value: DeliveryAddress }
  | { ok: false; error: string };

export function parseDeliveryAddress(raw: unknown): DeliveryAddressResult {
  const r = DireccionSchema.safeParse(raw);
  if (!r.success) {
    // Un problema a la vez: una lista de cuatro no ayuda a rellenar un
    // formulario.
    return { ok: false, error: r.error.issues[0]?.message ?? "Revisa la dirección." };
  }
  return {
    ok: true,
    value: {
      ...r.data,
      // Vacío y "no lo puso" son lo mismo: no se guarda una cadena vacía que
      // luego haya que distinguir de un nulo.
      reference: r.data.reference ? r.data.reference : undefined,
    },
  };
}
