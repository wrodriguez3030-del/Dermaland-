"use client";

import * as React from "react";
import type { User, UserRole } from "@/types";
import { mockUsers } from "@/lib/mock-data/users";

/**
 * Directorio de PERSONAL (usuarios) del negocio.
 *  - supabase → /api/users (RLS por business).
 *  - mock     → mockUsers (demo).
 *
 * Crear/editar aquí registra a la persona para atribución de ventas e
 * incentivos. NO otorga acceso al sistema (login) — eso es Supabase Auth
 * aparte.
 */

export const USER_BACKEND: "local" | "supabase" =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_DATA_SOURCE === "supabase"
    ? "supabase"
    : "local";

const CHANGE_EVENT = "dermaland:users-changed";

export interface UserInput {
  fullName: string;
  email: string;
  role: UserRole;
  branchIds: string[];
  phone?: string;
  status?: "active" | "disabled";
}

export type UserResult =
  | { ok: true; user?: User }
  | { ok: false; error: string };

function notify() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function useUsersList(): {
  users: User[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [users, setUsers] = React.useState<User[]>(() =>
    USER_BACKEND === "supabase" ? [] : mockUsers,
  );
  const [loading, setLoading] = React.useState(USER_BACKEND === "supabase");
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(() => {
    if (USER_BACKEND === "supabase") {
      fetch("/api/users")
        .then(async (res) => {
          const data = (await res.json().catch(() => ({}))) as {
            users?: User[];
            error?: string;
          };
          if (!res.ok) throw new Error(data.error);
          setUsers(data.users ?? []);
          setError(null);
        })
        .catch(() => setError("No se pudieron cargar los usuarios."))
        .finally(() => setLoading(false));
    } else {
      setUsers(mockUsers);
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
    window.addEventListener(CHANGE_EVENT, refresh);
    return () => window.removeEventListener(CHANGE_EVENT, refresh);
  }, [refresh]);

  return { users, loading, error, refresh };
}

async function call(path: string, method: string, body: unknown): Promise<UserResult> {
  try {
    const res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { user?: User; error?: string };
    if (!res.ok) return { ok: false, error: data.error ?? "No se pudo guardar." };
    notify();
    return { ok: true, user: data.user };
  } catch {
    return { ok: false, error: "Sin conexión con el servidor." };
  }
}

export async function saveUser(input: UserInput, id?: string): Promise<UserResult> {
  if (USER_BACKEND !== "supabase") {
    // Demo local: no persiste (mockUsers es estático). Informa al usuario.
    return {
      ok: false,
      error: "En modo demo local los usuarios no se guardan. Activa Supabase.",
    };
  }
  return id ? call(`/api/users/${id}`, "PATCH", input) : call("/api/users", "POST", input);
}

export async function setUserStatus(
  id: string,
  status: "active" | "disabled",
): Promise<UserResult> {
  if (USER_BACKEND !== "supabase") return { ok: false, error: "Requiere Supabase." };
  return call(`/api/users/${id}`, "PATCH", { status });
}
