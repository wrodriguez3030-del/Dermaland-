export const APP_NAME = 'DermaLand' as const;
export const COUNTRY_CODE = 'DO' as const;
export const DEFAULT_CURRENCY = 'DOP' as const;
export const DEFAULT_LOCALE = 'es-DO' as const;
export const DEFAULT_TIMEZONE = 'America/Santo_Domingo' as const;

export const ECF_TYPES = {
  CREDITO_FISCAL: '31',
  CONSUMO: '32',
  NOTA_DEBITO: '33',
  NOTA_CREDITO: '34',
  COMPRAS: '41',
  GASTOS_MENORES: '43',
  REGIMENES_ESPECIALES: '44',
  GUBERNAMENTAL: '45',
} as const;

export const PERMISSIONS = {
  CLIENTS_READ: 'clients:read',
  CLIENTS_WRITE: 'clients:write',
  CLIENTS_DELETE: 'clients:delete',
  BRANCHES_READ: 'branches:read',
  BRANCHES_WRITE: 'branches:write',
  USERS_INVITE: 'users:invite',
  USERS_ASSIGN_ROLE: 'users:assign_role',
  AUDIT_READ: 'audit:read',
  BUSINESS_SETTINGS: 'business:settings',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
