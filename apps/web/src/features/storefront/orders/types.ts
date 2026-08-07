import type { WebOrderStatus } from "./status";

/**
 * El pedido tal como lo consumen las pantallas.
 *
 * Igual que `PublicProduct`, no lleva UUID internos ni nada que el cliente no
 * deba ver: la ficha del pedido se sirve SIN sesión (por token firmado), así que
 * todo lo que aparezca aquí puede acabar en el HTML de una página pública.
 */

export interface WebOrderItem {
  /** Nombre tal como se ofreció, no el de hoy. */
  productName: string;
  unitPrice: number;
  qty: number;
  lineTotal: number;
}

export interface WebOrder {
  /** `WEB-000123`. Para hablar con el cliente, nunca para dar acceso. */
  number: string;
  status: WebOrderStatus;
  /** Nombre COMERCIAL de la sucursal: donde se retira, o desde donde se envía. */
  branchName: string;
  fulfillment: "pickup" | "delivery";
  /** Solo en envío. Nombre de la provincia, nunca su slug. */
  deliveryProvince?: string;
  deliverySector?: string;
  deliveryAddress?: string;
  deliveryReference?: string;
  /**
   * Ubicación que el cliente compartió desde el navegador. Opcional: dar
   * permiso es voluntario. Van juntas o ninguna.
   */
  deliveryLat?: number;
  deliveryLng?: number;
  /** Flete cobrado. Se guarda aparte para no recalcularlo con tarifas de hoy. */
  shippingCost: number;
  paymentMethod: "efectivo" | "transferencia" | "tarjeta";
  paymentStatus: "pendiente" | "pagado" | "reembolsado";
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  total: number;
  items: WebOrderItem[];
  notes?: string;
  createdAt: string;
}
