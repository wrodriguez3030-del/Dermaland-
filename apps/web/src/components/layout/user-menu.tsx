"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, LogOut, ShieldCheck } from "lucide-react";
import { signOut } from "@/server/auth/actions";
import type { CurrentUser } from "@/features/auth/current-user";

/**
 * Menú del usuario en el header: identidad + acceso a seguridad + CERRAR SESIÓN.
 *
 * El botón de salir faltaba por completo: `signOut()` existía en
 * `server/auth/actions.ts` pero ningún componente lo llamaba, así que las
 * sesiones de Supabase se acumulaban sin cerrarse nunca (9 abiertas al
 * detectarlo el 2026-08-02) y no había forma de cambiar de usuario.
 *
 * "Cerrar sesión" es un `<button type="submit">` dentro de un `<form>` que
 * apunta a la server action: así funciona aun sin JavaScript y evita exponer
 * el logout como un enlace GET (que los prefetchers podrían disparar solos).
 */
export function UserMenu({ user }: { user: CurrentUser }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  // Cerrar al hacer clic fuera o con Escape.
  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = user.fullName
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="Abrir menú de usuario"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-black/5 bg-white pl-1 pr-2 py-1 hover:bg-black/[0.02]"
      >
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white"
          style={{ background: user.avatarColor }}
        >
          {initials}
        </span>
        <div className="hidden lg:block text-left">
          <div className="text-xs font-medium leading-tight">{user.fullName}</div>
          <div className="text-[10px] uppercase tracking-wider opacity-50">
            {user.role.replace("_", " ")}
          </div>
        </div>
        <ChevronDown
          className={`h-3 w-3 opacity-40 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Menú de usuario"
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-black/5 bg-white shadow-lg"
        >
          <div className="border-b border-black/5 px-3 py-2">
            <div className="truncate text-sm font-medium">{user.fullName}</div>
            <div className="text-[11px] uppercase tracking-wider opacity-50">
              {user.role.replace("_", " ")}
            </div>
          </div>

          <Link
            role="menuitem"
            href="/perfil/seguridad"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-black/[0.03]"
          >
            <ShieldCheck className="h-4 w-4 opacity-60" aria-hidden />
            Seguridad de la cuenta
          </Link>

          <form action={signOut} className="border-t border-black/5">
            <button
              role="menuitem"
              type="submit"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Cerrar sesión
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
