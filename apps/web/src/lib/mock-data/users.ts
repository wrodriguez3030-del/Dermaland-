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
    permissions: ["platform:*"],
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
    ],
  },
  {
    key: "supervisor",
    label: "Supervisor",
    description: "Aprueba ajustes, revisa diferencias de conteo.",
    permissions: [
      "inventory:read",
      "inventory_count:review|approve|reject",
      "inventory_count:adjust|view_differences",
      "audit:read",
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
    ],
  },
];

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

  // DGII
  { key: "dgii:read", module: "DGII", description: "Ver e-CF y secuencias" },
  { key: "dgii:write", module: "DGII", description: "Configurar fiscal y secuencias" },

  // Audit & reports
  { key: "audit:read", module: "Auditoría", description: "Ver auditoría" },
  { key: "reports:read", module: "Reportes", description: "Ver reportes" },
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
