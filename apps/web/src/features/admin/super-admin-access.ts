// Decisión de acceso a Súper Admin (pura, testeable).
//
// Solo entran administradores de plataforma (`is_platform_admin`) o rol
// `super_admin`. En modo demo (`DATA_SOURCE=mock`) se permite para pruebas,
// igual que el middleware. Un usuario normal queda fuera.

export interface SuperAdminAccessInput {
  isMock: boolean;
  isPlatformAdmin?: boolean;
  role?: string;
}

export function canAccessSuperAdmin(input: SuperAdminAccessInput): boolean {
  return input.isMock || input.isPlatformAdmin === true || input.role === "super_admin";
}
