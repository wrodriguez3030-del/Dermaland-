import type {
  AuditLog,
  Permission,
  RoleDefinition,
  User,
  UserRole,
} from "@/types";

export const mockUsers: User[] = [
  {
    id: "usr_admin",
    businessId: "biz_dermaland",
    email: "wrodriguez@dermaland.do",
    fullName: "Wilson Rodríguez",
    phone: "+1 809-555-0001",
    role: "admin",
    branchIds: ["br_santiago", "br_sd_naco", "br_sd_piantini"],
    twoFactorEnabled: true,
    status: "active",
    lastLoginAt: "2026-05-05T08:30:00Z",
    avatarColor: "#1A7F8E",
    createdAt: "2026-05-04T14:00:00Z",
    updatedAt: "2026-05-05T08:30:00Z",
  },
  {
    id: "usr_manager_stg",
    businessId: "biz_dermaland",
    email: "ana.guzman@dermaland.do",
    fullName: "Ana Guzmán",
    phone: "+1 809-555-0011",
    role: "manager",
    branchIds: ["br_santiago"],
    twoFactorEnabled: true,
    status: "active",
    lastLoginAt: "2026-05-05T07:55:00Z",
    avatarColor: "#2DB4A8",
    createdAt: "2026-05-04T15:00:00Z",
    updatedAt: "2026-05-05T07:55:00Z",
  },
  {
    id: "usr_cashier_1",
    businessId: "biz_dermaland",
    email: "rosa.peralta@dermaland.do",
    fullName: "Rosa Peralta",
    role: "cashier",
    branchIds: ["br_santiago"],
    twoFactorEnabled: false,
    status: "active",
    lastLoginAt: "2026-05-05T08:10:00Z",
    avatarColor: "#F97316",
    createdAt: "2026-05-04T15:30:00Z",
    updatedAt: "2026-05-05T08:10:00Z",
  },
  {
    id: "usr_cashier_2",
    businessId: "biz_dermaland",
    email: "luis.vargas@dermaland.do",
    fullName: "Luis Vargas",
    role: "cashier",
    branchIds: ["br_santiago"],
    twoFactorEnabled: false,
    status: "active",
    lastLoginAt: "2026-05-05T08:05:00Z",
    avatarColor: "#7C3AED",
    createdAt: "2026-05-04T15:30:00Z",
    updatedAt: "2026-05-05T08:05:00Z",
  },
  {
    id: "usr_inv",
    businessId: "biz_dermaland",
    email: "carlos.mejia@dermaland.do",
    fullName: "Carlos Mejía",
    role: "inventory",
    branchIds: ["br_santiago", "br_sd_naco"],
    twoFactorEnabled: false,
    status: "active",
    lastLoginAt: "2026-05-05T07:30:00Z",
    avatarColor: "#0EA5E9",
    createdAt: "2026-05-04T16:00:00Z",
    updatedAt: "2026-05-05T07:30:00Z",
  },
  {
    id: "usr_supervisor",
    businessId: "biz_dermaland",
    email: "maria.torres@dermaland.do",
    fullName: "María Torres",
    role: "supervisor",
    branchIds: ["br_santiago"],
    twoFactorEnabled: true,
    status: "active",
    avatarColor: "#10B981",
    createdAt: "2026-05-04T16:30:00Z",
    updatedAt: "2026-05-04T16:30:00Z",
  },
  {
    id: "usr_auditor",
    businessId: "biz_dermaland",
    email: "auditor@dermaland.do",
    fullName: "Pedro Núñez",
    role: "auditor",
    branchIds: ["br_santiago", "br_sd_naco", "br_sd_piantini"],
    twoFactorEnabled: true,
    status: "invited",
    avatarColor: "#64748B",
    createdAt: "2026-05-04T17:00:00Z",
    updatedAt: "2026-05-04T17:00:00Z",
  },
];

export const mockCurrentUser = mockUsers[0]!;

export function getUserById(id: string) {
  return mockUsers.find((u) => u.id === id);
}

export const roleDefinitions: RoleDefinition[] = [
  {
    key: "super_admin",
    label: "Súper Admin",
    description: "Acceso total a la plataforma. Solo personal interno.",
    // `dgii:*` y `cash:*` añadidos para Fase C — permite soporte interno
    // operar sobre módulos DGII/caja de cualquier business cuando aplique.
    permissions: ["platform:*", "dgii:*", "cash:*"],
  },
  {
    key: "admin",
    label: "Admin",
    description: "Administra el negocio: sucursales, usuarios, configuración.",
    permissions: [
      "business:*",
      "users:*",
      "branches:*",
      "products:*",
      "inventory:*",
      "sales:*",
      "reports:*",
      "audit:read",
      // DGII granular — admin tiene acceso completo al módulo fiscal del
      // business (incluye certificado, secuencias, todos los flujos de
      // facturación y notas de crédito).
      "dgii:*",
      // Caja granular — admin también puede autorizar % < 100 y reversar
      // cierres. En segregación estricta se podría restringir al rol
      // supervisor — ver convención abajo.
      "cash:*",
    ],
  },
  {
    key: "manager",
    label: "Gerente de sucursal",
    description: "Gestiona la sucursal asignada — POS, inventario, conteos.",
    permissions: [
      "branch:read",
      "products:read",
      "inventory:read|write",
      "inventory_count:create|review|approve",
      "sales:*",
      "cash_register:open|close",
      "reports:read",
      // DGII operacional — emite y firma e-CF, crea NC, ve reportes. NO
      // gestiona certificado ni secuencias (eso queda en admin).
      "dgii:invoices:generate_xml|validate_xml|sign|send|check_status|download_xml|download_pdf",
      "dgii:credit_notes:create",
      "dgii:reports:view",
      "cash:open|close|change_closing_percentage",
    ],
  },
  {
    key: "cashier",
    label: "Cajero",
    description: "Atiende ventas en POS, abre/cierra su caja.",
    permissions: [
      "products:read",
      "inventory:read",
      "sales:create",
      "proformas:create|read",
      "payments:create",
      "cash_register:open|close",
      // DGII mínimo — cobra con tarjeta (genera e-CF inmediato) y entrega
      // PDF al cliente. NO firma manualmente, NO consulta status, NO
      // descarga XML (eso lo hace manager/admin si hay dudas).
      "dgii:invoices:generate_xml",
      "dgii:invoices:download_pdf",
      "cash:open",
      "cash:close",
    ],
  },
  {
    key: "inventory",
    label: "Inventario",
    description: "Recepciones, conteos, ajustes con motivo.",
    permissions: [
      "products:read",
      "inventory:read|write|adjust|transfer",
      "lots:read|write|quarantine",
      "inventory_count:create|submit|mobile_scan",
      "purchases:receive",
      // SIN permisos DGII / cash — inventario no opera fiscalmente.
    ],
  },
  {
    key: "supervisor",
    label: "Supervisor",
    description:
      "Aprueba ajustes, revisa diferencias de conteo y autoriza cierres sensibles.",
    permissions: [
      "inventory:read",
      "inventory_count:review|approve|reject",
      "inventory_count:adjust|view_differences",
      "audit:read",
      // Aprobador de cierres caja sensibles — la convención de
      // segregación de funciones recomienda que el supervisor (no el
      // cajero ni el manager) autorice cierres con % < 100 y reversos.
      "dgii:reports:view",
      "cash:authorize_below_100_percent",
      "cash:reverse_closing",
    ],
  },
  {
    key: "auditor",
    label: "Auditor",
    description: "Solo lectura — auditoría, reportes, logs.",
    permissions: [
      "audit:read",
      "reports:read",
      "sales:read",
      "inventory:read",
      "dgii:read",
      // DGII solo-lectura — auditor puede ver reportes, consultar status
      // por TrackId y descargar artefactos para revisión, pero NO genera,
      // firma ni envía.
      "dgii:reports:view",
      "dgii:invoices:check_status",
      "dgii:invoices:download_xml",
      "dgii:invoices:download_pdf",
    ],
  },
];

/**
 * Evalúa si un patrón de permiso (formato `modulo:accion` con soporte de
 * wildcard `:*` y OR de acciones `accion1|accion2`) cubre una key concreta.
 *
 * Ejemplos:
 *  - `permissionMatchesPattern("dgii:*", "dgii:invoices:sign")` → true
 *  - `permissionMatchesPattern("dgii:invoices:generate_xml|sign", "dgii:invoices:sign")` → true
 *  - `permissionMatchesPattern("cash:open", "cash:close")` → false
 *  - `permissionMatchesPattern("*", "anything")` → true
 */
export function permissionMatchesPattern(
  pattern: string,
  key: string,
): boolean {
  if (pattern === "*") return true;
  if (pattern === key) return true;
  if (pattern.endsWith(":*")) {
    return key.startsWith(pattern.slice(0, -1));
  }
  if (pattern.includes("|")) {
    // OR en el último segmento: `prefix:a|b|c` → expand a `prefix:a`, `prefix:b`, `prefix:c`.
    const lastColon = pattern.lastIndexOf(":");
    if (lastColon === -1) return false;
    const prefix = pattern.slice(0, lastColon + 1);
    const actions = pattern.slice(lastColon + 1).split("|");
    return actions.some((a) => prefix + a === key);
  }
  return false;
}

/**
 * `true` si el rol tiene el permiso indicado (vía match exacto, wildcard,
 * o OR de acciones).
 */
export function roleHasPermission(
  role: RoleDefinition,
  key: string,
): boolean {
  return role.permissions.some((p) => permissionMatchesPattern(p, key));
}

export const allPermissions: Permission[] = [
  // Business / branches / users
  { key: "business:settings", module: "Empresa", description: "Editar configuración del negocio" },
  { key: "branches:read", module: "Sucursales", description: "Ver sucursales" },
  { key: "branches:write", module: "Sucursales", description: "Crear/editar sucursales" },
  { key: "users:invite", module: "Usuarios", description: "Invitar usuarios" },
  { key: "users:assign_role", module: "Usuarios", description: "Asignar roles" },

  // Catalog
  { key: "products:read", module: "Productos", description: "Ver productos" },
  { key: "products:write", module: "Productos", description: "Crear/editar productos" },
  { key: "products:delete", module: "Productos", description: "Eliminar productos (soft)" },

  // Inventory
  { key: "inventory:read", module: "Inventario", description: "Ver stock" },
  { key: "inventory:write", module: "Inventario", description: "Recepciones, salidas" },
  { key: "inventory:adjust", module: "Inventario", description: "Ajustes con motivo" },
  { key: "inventory:transfer", module: "Inventario", description: "Transferencias entre almacenes" },
  { key: "lots:quarantine", module: "Lotes", description: "Mover lote a cuarentena" },
  { key: "lots:recall", module: "Lotes", description: "Marcar recall de lote" },

  // Inventory counts
  { key: "inventory_count:create", module: "Conteo físico", description: "Crear sesión de conteo" },
  { key: "inventory_count:mobile_scan", module: "Conteo físico", description: "Escanear desde móvil" },
  { key: "inventory_count:manual_quantity", module: "Conteo físico", description: "Entrada manual de cantidad (cajas cerradas, código dañado)" },
  { key: "inventory_count:submit", module: "Conteo físico", description: "Enviar conteo a revisión" },
  { key: "inventory_count:review", module: "Conteo físico", description: "Revisar diferencias" },
  { key: "inventory_count:approve", module: "Conteo físico", description: "Aprobar ajustes de conteo" },
  { key: "inventory_count:decrement", module: "Conteo físico", description: "Restar línea contada" },
  { key: "inventory_count:remove_item", module: "Conteo físico", description: "Eliminar línea de conteo con motivo" },

  // POS / Cash register
  { key: "sales:create", module: "Ventas", description: "Crear ventas/proformas" },
  { key: "sales:read", module: "Ventas", description: "Ver historial de ventas" },
  { key: "payments:create", module: "Pagos", description: "Registrar pagos" },
  { key: "cash_register:open", module: "Caja", description: "Abrir caja" },
  { key: "cash_register:close", module: "Caja", description: "Cerrar caja" },

  // DGII — legacy (se mantienen para compatibilidad)
  { key: "dgii:read", module: "DGII", description: "Ver e-CF y secuencias" },
  { key: "dgii:write", module: "DGII", description: "Configurar fiscal y secuencias" },

  // DGII — granulares (Fase C activará RLS sobre estos)
  { key: "dgii:configure", module: "Configuración DGII", description: "Editar configuración fiscal del business (RNC, ambiente, URLs)" },

  { key: "dgii:certificate:upload", module: "Certificado", description: "Subir/reemplazar certificado digital .p12 del business" },

  { key: "dgii:sequences:manage", module: "Secuencias", description: "Importar y gestionar secuencias e-NCF por tipo" },

  { key: "dgii:invoices:generate_xml", module: "Facturas electrónicas", description: "Generar XML e-CF a partir de una venta/proforma" },
  { key: "dgii:invoices:validate_xml", module: "Facturas electrónicas", description: "Ejecutar validación contra XSD oficial DGII" },
  { key: "dgii:invoices:sign", module: "Facturas electrónicas", description: "Firmar el XML con el certificado digital del business" },
  { key: "dgii:invoices:send", module: "Facturas electrónicas", description: "Enviar el XML firmado al endpoint DGII (ambiente actual)" },
  { key: "dgii:invoices:check_status", module: "Facturas electrónicas", description: "Consultar estado/TrackId del comprobante en DGII" },
  { key: "dgii:invoices:download_xml", module: "Facturas electrónicas", description: "Descargar el XML (firmado o sin firmar) del comprobante" },
  { key: "dgii:invoices:download_pdf", module: "Facturas electrónicas", description: "Descargar la representación impresa (PDF) del comprobante" },

  { key: "dgii:credit_notes:create", module: "Notas de crédito", description: "Crear Nota de Crédito (e-CF 34) desde un comprobante origen" },

  { key: "dgii:reports:view", module: "Reportes", description: "Ver reportes fiscales DGII (por tipo, estado, secuencias)" },

  { key: "dgii:certification:run_tests", module: "Pre-certificación", description: "Ejecutar el set de pruebas internas contra ambiente testecf" },

  // Caja / cierre — granulares (las legacy `cash_register:open|close` quedan
  // como aliases hasta migración Fase C). El cierre con porcentaje editable
  // y autorización admin son los más sensibles fiscalmente.
  { key: "cash:open", module: "Caja/cierre", description: "Abrir sesión de caja" },
  { key: "cash:close", module: "Caja/cierre", description: "Cerrar sesión de caja" },
  { key: "cash:change_closing_percentage", module: "Caja/cierre", description: "Cambiar el % de proformas a convertir en e-CF durante el cierre" },
  { key: "cash:authorize_below_100_percent", module: "Caja/cierre", description: "Autorizar cierres con % < 100 (requiere comentario)" },
  { key: "cash:reverse_closing", module: "Caja/cierre", description: "Reversar un cierre confirmado (proceso especial con auditoría)" },

  // Audit & reports
  { key: "audit:read", module: "Auditoría", description: "Ver auditoría" },
  { key: "reports:read", module: "Reportes", description: "Ver reportes" },
];

/**
 * Permisos preparados como MOCK / PENDIENTE.
 *
 * Estos permisos están definidos en el catálogo pero todavía NO se
 * enforcean en runtime — `DATA_SOURCE=mock` permite cualquier acción a
 * cualquier usuario para iteración local. Cuando se autorice Fase C
 * (Supabase + RLS), estos pasan a ser obligatorios:
 *  - Las server actions verifican el permiso antes de ejecutar.
 *  - Las RLS policies de Supabase rechazan operaciones sin el permiso.
 *  - El UI oculta acciones cuando el usuario no tiene el permiso.
 *
 * Mantener este set sincronizado con los seeds de la tabla `permissions`
 * que se inserten en la migración Fase C.
 */
export const DGII_RBAC_PENDING_KEYS: ReadonlySet<string> = new Set([
  "dgii:configure",
  "dgii:certificate:upload",
  "dgii:sequences:manage",
  "dgii:invoices:generate_xml",
  "dgii:invoices:validate_xml",
  "dgii:invoices:sign",
  "dgii:invoices:send",
  "dgii:invoices:check_status",
  "dgii:invoices:download_xml",
  "dgii:invoices:download_pdf",
  "dgii:credit_notes:create",
  "dgii:reports:view",
  "dgii:certification:run_tests",
  "cash:open",
  "cash:close",
  "cash:change_closing_percentage",
  "cash:authorize_below_100_percent",
  "cash:reverse_closing",
]);

/** Orden de presentación de las categorías DGII en `/admin/permisos`. */
export const DGII_PERMISSION_MODULES_ORDER: ReadonlyArray<string> = [
  "Configuración DGII",
  "Certificado",
  "Secuencias",
  "Facturas electrónicas",
  "Notas de crédito",
  "Reportes",
  "Pre-certificación",
  "Caja/cierre",
];

export const mockAuditLogs: AuditLog[] = [
  {
    id: "log_001",
    businessId: "biz_dermaland",
    userId: "usr_admin",
    userName: "Wilson Rodríguez",
    action: "auth.login",
    entity: "session",
    entityId: "sess_abc123",
    ipAddress: "190.166.10.4",
    createdAt: "2026-05-05T08:30:00Z",
  },
  {
    id: "log_002",
    businessId: "biz_dermaland",
    userId: "usr_admin",
    userName: "Wilson Rodríguez",
    action: "branch.create",
    entity: "branch",
    entityId: "br_sd_naco",
    metadata: { name: "DermaLand Naco" },
    createdAt: "2026-05-05T08:32:14Z",
  },
  {
    id: "log_003",
    businessId: "biz_dermaland",
    userId: "usr_inv",
    userName: "Carlos Mejía",
    action: "product_lot.quarantine",
    entity: "product_lot",
    entityId: "lot_eu_lrp_24a",
    branchId: "br_santiago",
    metadata: {
      reason: "Etiqueta dañada en recepción",
      productId: "prod_lrp_001",
    },
    createdAt: "2026-05-05T08:48:02Z",
  },
  {
    id: "log_004",
    businessId: "biz_dermaland",
    userId: "usr_supervisor",
    userName: "María Torres",
    action: "inventory_count.approve",
    entity: "inventory_count",
    entityId: "ic_2026_05_05_001",
    branchId: "br_santiago",
    metadata: { adjustments: 14, shortages: 6, overages: 8 },
    createdAt: "2026-05-05T09:02:18Z",
  },
  {
    id: "log_005",
    businessId: "biz_dermaland",
    userId: "usr_cashier_1",
    userName: "Rosa Peralta",
    action: "cash_register.open",
    entity: "cash_register_session",
    entityId: "crs_2026_05_05_001",
    branchId: "br_santiago",
    metadata: { openingAmount: 5000 },
    createdAt: "2026-05-05T09:05:00Z",
  },
  {
    id: "log_006",
    businessId: "biz_dermaland",
    userId: "usr_cashier_1",
    userName: "Rosa Peralta",
    action: "proforma.create",
    entity: "proforma",
    entityId: "prof_2026_00187",
    branchId: "br_santiago",
    metadata: { total: 2890, items: 3 },
    createdAt: "2026-05-05T09:18:42Z",
  },
  {
    id: "log_007",
    businessId: "biz_dermaland",
    userId: "usr_admin",
    userName: "Wilson Rodríguez",
    action: "user.invite",
    entity: "user",
    entityId: "usr_auditor",
    metadata: { email: "auditor@dermaland.do", role: "auditor" },
    createdAt: "2026-05-04T17:00:00Z",
  },
  {
    id: "log_008",
    businessId: "biz_dermaland",
    userId: "usr_inv",
    userName: "Carlos Mejía",
    action: "inventory_movement.adjustment_negative",
    entity: "inventory_movement",
    entityId: "mov_002145",
    branchId: "br_santiago",
    metadata: { productId: "prod_eu_002", quantity: -2, reason: "Producto vencido" },
    createdAt: "2026-05-05T07:42:00Z",
  },
];

export function roleBadgeTone(role: UserRole) {
  switch (role) {
    case "admin":
      return "primary" as const;
    case "manager":
      return "info" as const;
    case "cashier":
      return "warning" as const;
    case "inventory":
      return "success" as const;
    case "supervisor":
      return "purple" as const;
    case "auditor":
      return "neutral" as const;
    case "super_admin":
      return "danger" as const;
  }
}
