import "server-only";
import { getSession, type AuthSession } from "@/server/auth/context";

/** Error con status HTTP para respuestas amigables (sin filtrar detalles). */
export class AiAccessError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "AiAccessError";
  }
}

/** Cualquier rol que gestiona el negocio puede ADMINISTRAR proveedores de IA. */
function canManageAi(session: AuthSession): boolean {
  return session.isPlatformAdmin || session.user.role === "admin" || session.user.role === "manager";
}

/** Requiere sesión + rol de administración. Para configurar/probar/eliminar. */
export async function requireAiAdmin(): Promise<AuthSession> {
  const session = await getSession();
  if (!session) throw new AiAccessError(401, "No autenticado.");
  if (!canManageAi(session)) {
    throw new AiAccessError(403, "Solo un administrador puede configurar proveedores de IA.");
  }
  return session;
}

/** Requiere sesión (cualquier usuario del negocio). Para lectura/uso. */
export async function requireAiUser(): Promise<AuthSession> {
  const session = await getSession();
  if (!session) throw new AiAccessError(401, "No autenticado.");
  return session;
}
