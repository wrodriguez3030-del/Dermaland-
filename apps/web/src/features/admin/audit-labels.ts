/**
 * Etiquetas legibles para el módulo de Auditoría.
 *
 * Los registros guardan `action` y `entity` como códigos técnicos
 * (`sale.whatsapp_share`, `proforma.create`, `firmar`, …). Estas funciones los
 * traducen a texto que un usuario de negocio entienda, con un fallback que al
 * menos prettifica el código (sin puntos/guiones bajos).
 */

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
  cash_register: "Caja",
  cash_closing: "Cierre de caja",
  payment: "Pago",
  receivable: "Cuenta por cobrar",
  dgii_invoice: "Factura electrónica",
  ecf: "Factura electrónica",
  certificate: "Certificado digital",
  sequence: "Secuencia e-NCF",
  commission_batch: "Lote de comisiones",
};

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
