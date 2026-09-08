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
      // Sin cuerpo no se manda `Content-Type` ni `body`: un DELETE con
      // `body: "undefined"` es un cuerpo con la palabra «undefined» dentro.
      ...(body === undefined
        ? {}
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
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

/**
 * Elimina a una persona del personal, con su cuenta de acceso.
 *
 * 🔴 El servidor se niega si dejó rastro (ventas, auditoría, cajas…) y explica
 * por qué en el mensaje. Ese texto se enseña TAL CUAL: es el que dice que hay
 * que desactivar en vez de borrar, y resumirlo a «no se pudo eliminar» dejaría
 * al dueño adivinando.
 */
export async function eliminarUsuario(id: string): Promise<UserResult> {
  if (USER_BACKEND !== "supabase") return { ok: false, error: "Requiere Supabase." };
  return call(`/api/users/${id}`, "DELETE", undefined);
}

export async function setUserStatus(
  id: string,
  status: "active" | "disabled",
): Promise<UserResult> {
  if (USER_BACKEND !== "supabase") return { ok: false, error: "Requiere Supabase." };
  return call(`/api/users/${id}`, "PATCH", { status });
}

/**
 * Estado REAL del acceso de una persona, tal como lo devuelve `GET /api/users`
 * a un administrador. Todos opcionales: sin Supabase, o para quien no es
 * administrador, la lista no los trae.
 */
export interface EstadoDeAcceso {
  tieneCuenta?: boolean;
  ultimoAcceso?: string | null;
  bloqueado?: boolean;
  totpVerificados?: number;
  claveGestionada?: boolean;
  claveDesincronizada?: boolean;
  claveAsignadaEl?: string | null;
  dispositivosActivos?: number;
}

export type UsuarioDelPanel = User & EstadoDeAcceso;

/** Lo que devuelve el ojo. La clave NO se guarda en ningún estado global. */
export type ResultadoClave =
  | { ok: true; clave: string; asignadaEl: string; asignadaPor: string | null }
  | { ok: false; error: string; pideSegundoFactor?: boolean };

/**
 * Manda al desafío del segundo factor conservando a dónde iba.
 *
 * El servidor responde 403 con `code: "segundo_factor_requerido"` cuando la
 * sesión no ha usado el código (típico en una computadora de confianza).
 * Enseñar «no tienes permiso» sería mentira: permiso tiene, le falta el código.
 */
function alSegundoFactor(): void {
  if (typeof window === "undefined") return;
  const destino = window.location.pathname + window.location.search;
  window.location.href = `/login/mfa?next=${encodeURIComponent(destino)}`;
}

async function respuestaDeClave(res: Response): Promise<ResultadoClave> {
  const cuerpo = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    clave?: string;
    asignadaEl?: string;
    asignadaPor?: string | null;
  };
  if (!res.ok) {
    const pide = cuerpo.code === "segundo_factor_requerido";
    if (pide) alSegundoFactor();
    return { ok: false, error: cuerpo.error ?? "No se pudo completar la acción.", pideSegundoFactor: pide };
  }
  return {
    ok: true,
    clave: cuerpo.clave ?? "",
    asignadaEl: cuerpo.asignadaEl ?? "",
    asignadaPor: cuerpo.asignadaPor ?? null,
  };
}

/** Fija la clave de un usuario (y crea su cuenta si no la tenía). */
export async function asignarClave(
  id: string,
  password: string,
): Promise<{ ok: true; cuentaCreada: boolean } | { ok: false; error: string; pideSegundoFactor?: boolean }> {
  if (USER_BACKEND !== "supabase") return { ok: false, error: "Requiere Supabase." };
  try {
    const res = await fetch(`/api/users/${encodeURIComponent(id)}/clave`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const cuerpo = (await res.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
      cuentaCreada?: boolean;
    };
    if (!res.ok) {
      const pide = cuerpo.code === "segundo_factor_requerido";
      if (pide) alSegundoFactor();
      return { ok: false, error: cuerpo.error ?? "No se pudo fijar la clave.", pideSegundoFactor: pide };
    }
    notify();
    return { ok: true, cuentaCreada: Boolean(cuerpo.cuentaCreada) };
  } catch {
    return { ok: false, error: "Sin conexión con el servidor." };
  }
}

/**
 * Pide la clave guardada. POST a propósito (ver la ruta): cada llamada deja un
 * registro en auditoría y entrega una credencial.
 */
export async function verClave(id: string): Promise<ResultadoClave> {
  if (USER_BACKEND !== "supabase") return { ok: false, error: "Requiere Supabase." };
  try {
    const res = await fetch(`/api/users/${encodeURIComponent(id)}/clave/ver`, { method: "POST" });
    return await respuestaDeClave(res);
  } catch {
    return { ok: false, error: "Sin conexión con el servidor." };
  }
}
