"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ChevronDown, Shield, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { groups } from "./sidebar";
import { mockBusiness } from "@/lib/mock-data/tenancy";

const brandLogo = mockBusiness.logoUrl ?? "/brand/dermaland-logo.svg";

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Navegación móvil: botón hamburguesa (solo < lg) + drawer lateral con todos los
 * módulos y el selector de sucursal. Cierra con la X, al tocar fuera y al
 * navegar. La sucursal usa el store compartido, así header y POS se sincronizan.
 */
export function MobileNav({ showSuperAdmin = true }: { showSuperAdmin?: boolean }) {
  const [open, setOpen] = React.useState(false);
  // Portal solo tras montar (document.body no existe en SSR).
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const pathname = usePathname() ?? "/";

  // Cerrar al navegar (cambio de ruta).
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Bloquear scroll del body mientras el drawer está abierto.
  React.useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Abrir menú"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg hover:bg-black/5 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[60] lg:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
              <Link href="/" className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={brandLogo} alt={mockBusiness.commercialName} className="h-8 w-8 object-contain" />
                <span className="text-sm font-semibold">{mockBusiness.commercialName}</span>
              </Link>
              <button
                type="button"
                aria-label="Cerrar menú"
                onClick={() => setOpen(false)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg hover:bg-black/5"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-2 py-3">
              {groups.map((g) => (
                <MobileGroup key={g.label} group={g} pathname={pathname} />
              ))}
              {showSuperAdmin && (
                <div className="mt-3 border-t border-black/5 pt-3">
                  <Link
                    href="/super-admin"
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-3 text-sm font-medium",
                      pathname.startsWith("/super-admin")
                        ? "bg-violet-100 text-violet-900"
                        : "text-violet-700 hover:bg-violet-50",
                    )}
                  >
                    <Shield className="h-4 w-4" /> Súper Admin
                  </Link>
                </div>
              )}
            </nav>
          </aside>
          </div>,
          document.body,
        )}
    </>
  );
}

function MobileGroup({
  group,
  pathname,
}: {
  group: { label: string; icon: LucideIcon; items: { label: string; href: string }[] };
  pathname: string;
}) {
  const active = group.items.some((it) => isActive(pathname, it.href));
  const [expanded, setExpanded] = React.useState(active);
  const Icon = group.icon;
  return (
    <div className="mb-0.5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-3 text-sm font-medium hover:bg-black/5"
      >
        <Icon className="h-4 w-4 opacity-70" />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown className={cn("h-4 w-4 opacity-50 transition-transform", expanded && "rotate-180")} />
      </button>
      {expanded && (
        <div className="ml-4 border-l border-black/5 pl-2">
          {group.items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                "block rounded-lg px-3 py-2.5 text-sm",
                isActive(pathname, it.href)
                  ? "bg-[color:var(--brand-primary)]/10 font-medium text-[color:var(--brand-accent)]"
                  : "text-black/70 hover:bg-black/5",
              )}
            >
              {it.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
