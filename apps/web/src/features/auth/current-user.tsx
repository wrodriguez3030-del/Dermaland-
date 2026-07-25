"use client";

import { createContext, useContext } from "react";
import type { UserRole } from "@/types";

/**
 * DL-03: rol REAL del usuario en el cliente.
 *
 * Antes los componentes de cliente gateaban permisos con `mockCurrentUser`
 * (siempre admin), así que la UI mostraba acciones de admin a cualquiera. El
 * layout de `(app)` (Server Component) resuelve la sesión real con `getSession()`
 * y la inyecta aquí; los componentes de cliente consumen `useCurrentUser()`.
 * El gate de servidor (`authorizeRole`) sigue siendo la barrera real; esto
 * alinea la UI con esa barrera.
 */
export interface CurrentUser {
  id: string;
  fullName: string;
  role: UserRole;
  avatarColor: string;
  isPlatformAdmin: boolean;
}

const CurrentUserContext = createContext<CurrentUser | null>(null);

export function CurrentUserProvider({
  user,
  children,
}: {
  user: CurrentUser;
  children: React.ReactNode;
}) {
  return (
    <CurrentUserContext.Provider value={user}>
      {children}
    </CurrentUserContext.Provider>
  );
}

export function useCurrentUser(): CurrentUser {
  const u = useContext(CurrentUserContext);
  if (!u) {
    throw new Error("useCurrentUser debe usarse dentro de <CurrentUserProvider>.");
  }
  return u;
}

/** Atajo para el rol (el uso más común en gates de UI). */
export function useCurrentRole(): UserRole {
  return useCurrentUser().role;
}
