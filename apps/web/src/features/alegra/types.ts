/**
 * Tipos MÍNIMOS de la API de Alegra: solo los campos que DermaLand usa. La API
 * trae muchos más (contabilidad, plantillas, etc.) y se ignoran a propósito.
 * Verificados contra respuestas reales el 2026-09-05.
 */

export interface AlegraPrice {
  idPriceList: string;
  name: string;
  /** SIN ITBIS (lista «General», DOP). */
  price: number;
  main?: boolean;
}

export interface AlegraWarehouseStock {
  id: string;
  name: string;
  availableQuantity: number;
}

export interface AlegraCustomField {
  id?: string;
  key?: string;
  name?: string;
  value?: string | null;
}

export interface AlegraItem {
  id: string;
  name: string;
  status: "active" | "inactive";
  price: AlegraPrice[];
  inventory?: {
    unit?: string;
    unitCost?: number;
    availableQuantity?: number;
    warehouses?: AlegraWarehouseStock[];
  } | null;
  /** Solo viene con `?fields=customFields`. El código de barras vive en `key: "barcode"`. */
  customFields?: AlegraCustomField[];
  tax?: Array<{ percentage: string | number }>;
}

export interface AlegraContact {
  id: string;
  name: string;
  phonePrimary?: string | null;
  phoneSecondary?: string | null;
  mobile?: string | null;
  email?: string | null;
  /** RNC (9 dígitos) o cédula (11) cuando viene; casi siempre vacío. */
  identification?: string | null;
  identificationObject?: { type?: string | null; number?: string | null } | null;
  status: "active" | "inactive";
  type: string[];
  created_at?: string;
  updated_at?: string;
}

export interface AlegraInvoiceLine {
  id: string;
  name: string;
  /** SIN ITBIS. */
  price: number;
  quantity: number;
  discount?: number;
  discountAmount?: number;
  tax?: Array<{ amount?: number }>;
  total: number;
}

export interface AlegraPayment {
  id: string;
  date: string;
  amount: number;
  paymentMethod?: string;
  status?: string;
}

export interface AlegraInvoice {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** "YYYY-MM-DD HH:MM:SS" en hora de República Dominicana. */
  datetime?: string;
  status: "open" | "closed" | "void" | "draft";
  client?: {
    id: string;
    name: string;
    identification?: string | null;
    identificationType?: string | null;
  } | null;
  numberTemplate?: { prefix?: string | null; fullNumber?: string | null } | null;
  warehouse?: { id: string; name: string } | null;
  seller?: { id: string; name: string } | null;
  station?: { name?: string } | null;
  paymentMethod?: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  totalPaid: number;
  balance: number;
  items: AlegraInvoiceLine[];
  payments?: AlegraPayment[];
}
