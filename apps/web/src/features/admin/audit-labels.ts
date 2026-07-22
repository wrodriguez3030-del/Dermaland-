/**
 * Etiquetas legibles para el módulo de Auditoría.
 *
 * Los registros guardan `action` y `entity` como códigos técnicos
 * (`sale.whatsapp_share`, `proforma.create`, `firmar`, …). Estas funciones los
 * traducen a texto que un usuario de negocio entienda, con un fallback que al
 * menos prettifica el código (sin puntos/guiones bajos).
 */
import { formatCurrency } from "@/lib/utils/format";

const ACTION_LABELS: Record<string, string> = {
  append: "Anexo agregado",
  "ar.collect": "Cobro de cuenta por cobrar",
  "ar.credit_update": "Crédito del cliente actualizado",
  "ar.promise_create": "Promesa de pago creada",
  "ar.promise_update": "Promesa de pago actualizada",
  "ar.settings_update": "Política de crédito actualizada",
  "auth.login": "Inicio de sesión",
  batch_created: "Lote de comisiones creado",
  "branch.create": "Sucursal creada",
  cancel: "Anulación",
  "cash_register.open": "Caja abierta",
  consultar_estado: "Consulta de estado en DGII",
  "dgii.sequence_reserved": "Secuencia e-NCF reservada",
  dgii_certificate_upload: "Certificado digital subido",
  enviar_dgii: "Comprobante enviado a la DGII",
  enviar_receptor: "Comprobante enviado al receptor",
  firmar: "Comprobante firmado",
  generar_ri: "Representación impresa generada",
  generar_xml: "XML e-CF generado",
  guardar_acuse: "Acuse de recibo guardado",
  "inventory_count.approve": "Conteo físico aprobado",
  "inventory_movement.adjustment_negative": "Ajuste negativo de inventario",
  "lot.received_below_min": "Lote recibido bajo el mínimo",
  paid: "Pago registrado",
  "product_lot.quarantine": "Lote enviado a cuarentena",
  "proforma.create": "Proforma creada",
  "sale.edit_blocked_ecf": "Edición bloqueada (ya es e-CF)",
  "sale.update": "Venta actualizada",
  "sale.update_full": "Venta actualizada (completa)",
  "sale.whatsapp_share": "Factura enviada por WhatsApp",
  "sale.email_share": "Factura enviada por correo",
  submit: "Enviado a revisión",
  update: "Actualización",
  update_full: "Actualización completa",
  "user.invite": "Usuario invitado",
  "users.created": "Usuario creado",
  "users.updated": "Usuario actualizado",
};

const ENTITY_LABELS: Record<string, string> = {
  proforma: "Comprobante",
  sale: "Venta",
  invoice: "Factura",
  client: "Cliente",
  customer: "Cliente",
  branch: "Sucursal",
  product: "Producto",
  product_lot: "Lote de producto",
  lot: "Lote",
  inventory: "Inventario",
  inventory_count: "Conteo físico",
  inventory_movement: "Movimiento de inventario",
  user: "Usuario",
  session: "Sesión",
  cash_register: "Caja",
  cash_register_session: "Sesión de caja",
  cash_closing: "Cierre de caja",
  payment: "Pago",
  receivable: "Cuenta por cobrar",
  dgii_invoice: "Factura electrónica",
  ecf: "Factura electrónica",
  certificate: "Certificado digital",
  sequence: "Secuencia e-NCF",
  commission_batch: "Lote de comisiones",
};

// Etiquetas de claves de metadata + cuáles se muestran como moneda.
const META_LABELS: Record<string, string> = {
  name: "Nombre",
  reason: "Motivo",
  total: "Total",
  subtotal: "Subtotal",
  itbis: "ITBIS",
  amount: "Monto",
  openingAmount: "Monto de apertura",
  closingAmount: "Monto de cierre",
  balance: "Balance",
  items: "Ítems",
  quantity: "Cantidad",
  adjustments: "Ajustes",
  shortages: "Faltantes",
  overages: "Sobrantes",
  phone: "Teléfono",
  documentNumber: "Comprobante",
  ncf: "NCF",
  ecfNumber: "e-NCF",
  channel: "Canal",
  pdfFilename: "Archivo",
  percentage: "Porcentaje",
};

const META_CURRENCY_KEYS = new Set([
  "total",
  "subtotal",
  "itbis",
  "amount",
  "openingAmount",
  "closingAmount",
  "balance",
]);

/** Claves de metadata con IDs internos que no aportan a un usuario de negocio. */
function isIdLikeKey(key: string): boolean {
  return /(^id$|Id$|_id$)/.test(key);
}

function prettify(code: string): string {
  const s = code.replace(/[._]/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Acción de auditoría en texto legible (ej. `sale.void` → "Venta anulada"). */
export function auditActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? prettify(action);
}

/** Tipo de entidad en texto legible (ej. `proforma` → "Comprobante"). */
export function auditEntityLabel(entity: string): string {
  return ENTITY_LABELS[entity] ?? prettify(entity);
}

/**
 * Convierte el `metadata` de un registro en pares { etiqueta, valor } legibles,
 * en vez del JSON crudo. Omite IDs internos y formatea montos como moneda.
 */
export function formatAuditMetadata(
  metadata: Record<string, unknown> | null | undefined,
): { label: string; value: string }[] {
  if (!metadata || typeof metadata !== "object") return [];
  return Object.entries(metadata)
    .filter(
      ([k, v]) => v !== null && v !== undefined && v !== "" && !isIdLikeKey(k),
    )
    .map(([k, v]) => {
      const label = META_LABELS[k] ?? prettify(k);
      let value: string;
      if (typeof v === "number" && META_CURRENCY_KEYS.has(k)) {
        value = formatCurrency(v);
      } else if (typeof v === "object") {
        value = JSON.stringify(v);
      } else {
        value = String(v);
      }
      return { label, value };
    });
}
