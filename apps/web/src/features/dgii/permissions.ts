// Quién puede hacer qué con los comprobantes fiscales.
//
// POR QUÉ ESTO NO ES UN `ReadonlyArray<UserRole>` MÁS
//
// El resto del sistema agrupa por módulo: "quién puede tocar inventario",
// "quién puede tocar finanzas". Con lo fiscal eso no alcanza, porque dentro del
// mismo módulo conviven acciones que no se parecen en nada:
//
//   · mirar el estado de un comprobante — lo hace cualquiera del mostrador;
//   · descargar el XML **firmado** — es el documento fiscal en crudo;
//   · sustituir el certificado digital — es la identidad fiscal del negocio;
//   · encender la emisión real — tiene consecuencias ante la DGII.
//
// Meterlas en un solo conjunto obliga a elegir entre dejar sin trabajar a la
// caja o darle a la caja la llave del certificado. Por eso el permiso es la
// unidad, y cada uno declara sus roles.
//
// LO QUE ESTO ARREGLA, HOY, EN PRODUCCIÓN
//
// Ocho rutas de `/api/dgii` no comprobaban rol. No estaban abiertas a internet
// —el portero exige sesión del negocio— pero **la RLS valida el `business_id`,
// no el rol** (DL-01). En la práctica, el usuario de inventario podía
// descargar el XML firmado de cualquier factura fiscal.
//
// Se implementa con roles y no con una tabla de permisos por usuario a
// propósito: es lo que el sistema ya sabe hacer, y un modelo de autorización
// paralelo solo para lo fiscal sería un segundo sitio donde equivocarse.

import type { UserRole } from "@/types";

/**
 * Las trece acciones fiscales. Los nombres son los del pliego para que el
 * documento y el código se puedan leer en paralelo.
 */
export const DGII_PERMISSIONS = [
  "dgii.view",
  "dgii.configure",
  "dgii.manage_certificate",
  "dgii.manage_sequences",
  "dgii.issue",
  "dgii.retry",
  "dgii.query_status",
  "dgii.download_xml",
  "dgii.receive",
  "dgii.commercial_approve",
  "dgii.commercial_reject",
  "dgii.certification_run",
  "dgii.audit_view",
  "dgii.production_enable",
] as const;

export type DgiiPermission = (typeof DGII_PERMISSIONS)[number];

/** Control total del negocio. */
const ADMIN: ReadonlyArray<UserRole> = ["super_admin", "admin"];
/** Admin más quien dirige la operación del día. */
const ADMIN_Y_GERENCIA: ReadonlyArray<UserRole> = [...ADMIN, "manager"];
/** Quien atiende y factura en el mostrador. */
const MOSTRADOR: ReadonlyArray<UserRole> = [
  ...ADMIN_Y_GERENCIA,
  "supervisor",
  "cashier",
  "vendedor",
];

/**
 * Qué rol puede ejercer cada permiso.
 *
 * Regla al asignar: **empezar por el conjunto más pequeño que permita
 * trabajar**. Ampliar un permiso es una decisión de negocio de dos minutos;
 * descubrir seis meses después que media plantilla podía descargar documentos
 * fiscales firmados no se arregla en dos minutos.
 */
const ROLES_POR_PERMISO: Record<DgiiPermission, ReadonlyArray<UserRole>> = {
  // El auditor entra aquí y en `audit_view` y en ningún sitio más: su trabajo
  // es mirar, y mirar no incluye descargar el documento firmado.
  "dgii.view": [...MOSTRADOR, "auditor"],

  // Configurar el contribuyente cambia lo que dirá cada comprobante emitido.
  "dgii.configure": ADMIN,

  // El certificado ES la identidad fiscal del negocio. Nadie más.
  "dgii.manage_certificate": ADMIN,

  // Las secuencias e-NCF son un recurso finito y numerado ante la DGII:
  // gastarlas o desordenarlas tiene consecuencias fuera del sistema.
  "dgii.manage_sequences": ADMIN,

  // Emitir es el trabajo del mostrador: es lo que pasa al cobrar una venta.
  "dgii.issue": MOSTRADOR,

  // Reintentar vuelve a hablar con la DGII. Que lo decida quien sepa por qué
  // falló la primera vez.
  "dgii.retry": ADMIN_Y_GERENCIA,

  // Preguntar por el estado no cambia nada y resuelve la duda del cliente que
  // está delante del mostrador.
  "dgii.query_status": MOSTRADOR,

  // ⚠️ El XML firmado es el documento fiscal en crudo, con los datos del
  // comprador y la firma del negocio dentro. Esto es lo que estaba abierto.
  "dgii.download_xml": ADMIN_Y_GERENCIA,

  // Recibir comprobantes de terceros es administración, no mostrador.
  "dgii.receive": ADMIN_Y_GERENCIA,

  // Aceptar un comprobante de un proveedor es aceptar un gasto.
  "dgii.commercial_approve": ADMIN_Y_GERENCIA,
  "dgii.commercial_reject": ADMIN_Y_GERENCIA,

  // Certificación consume secuencias de prueba y habla con un ambiente DGII.
  "dgii.certification_run": ADMIN,

  // El auditor existe para esto.
  "dgii.audit_view": [...ADMIN_Y_GERENCIA, "auditor"],

  // Encender la emisión real tiene consecuencias legales. Solo el dueño.
  "dgii.production_enable": ["super_admin"],
};

/** ¿Este rol puede ejercer este permiso? */
export function roleHasDgiiPermission(
  role: UserRole,
  permission: DgiiPermission,
): boolean {
  return ROLES_POR_PERMISO[permission].includes(role);
}

/** Los roles de un permiso, para pasárselos a `authorizeRole`. */
export function rolesForDgiiPermission(
  permission: DgiiPermission,
): ReadonlyArray<UserRole> {
  return ROLES_POR_PERMISO[permission];
}

/** Etiqueta legible. Un registro de auditoría con `dgii.download_xml` dentro no
 *  le dice nada a quien lo lea dentro de seis meses. */
const ETIQUETAS: Record<DgiiPermission, string> = {
  "dgii.view": "Ver comprobantes electrónicos",
  "dgii.configure": "Configurar el contribuyente",
  "dgii.manage_certificate": "Gestionar el certificado digital",
  "dgii.manage_sequences": "Gestionar secuencias e-NCF",
  "dgii.issue": "Emitir comprobantes",
  "dgii.retry": "Reintentar envíos",
  "dgii.query_status": "Consultar el estado en DGII",
  "dgii.download_xml": "Descargar el XML fiscal",
  "dgii.receive": "Recibir comprobantes de terceros",
  "dgii.commercial_approve": "Aprobar comercialmente",
  "dgii.commercial_reject": "Rechazar comercialmente",
  "dgii.certification_run": "Ejecutar certificación",
  "dgii.audit_view": "Ver la auditoría fiscal",
  "dgii.production_enable": "Encender la emisión fiscal real",
};

export function dgiiPermissionLabel(permission: DgiiPermission): string {
  return ETIQUETAS[permission];
}
