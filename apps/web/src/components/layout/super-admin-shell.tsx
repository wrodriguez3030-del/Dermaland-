"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  Building2,
  CreditCard,
  Layers,
  Palette,
  PiggyBank,
  Settings,
  Shield,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

const items = [
  { label: "Dashboard", href: "/super-admin", icon: BarChart3 },
  { label: "Negocios", href: "/super-admin/negocios", icon: Building2 },
  { label: "Planes", href: "/super-admin/planes", icon: Layers },
  { label: "Suscripciones", href: "/super-admin/suscripciones", icon: CreditCard },
  { label: "Uso y límites", href: "/super-admin/uso", icon: TrendingUp },
  { label: "Pagos", href: "/super-admin/pagos", icon: PiggyBank },
  { label: "Módulos", href: "/super-admin/modulos", icon: Settings },
  { label: "Branding", href: "/super-admin/branding", icon: Palette },
];

export function SuperAdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  return (
    <div className="flex min-h-screen bg-violet-950 text-violet-50">
      <aside className="hidden lg:flex w-64 flex-col border-r border-violet-800 bg-violet-950/80">
        <div className="flex items-center gap-2 px-5 py-5 border-b border-violet-800">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-700 text-white">
            <Shield className="h-5 w-5" />
          </span>
          <div>
            <div className="text-sm font-semibold leading-tight">Súper Admin</div>
            <div className="text-[10px] uppercase tracking-wider text-violet-300">
              Plataforma DermaLand
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4">
          {items.map((it) => {
            const Icon = it.icon;
            const active =
              it.href === "/super-admin"
                ? pathname === "/super-admin"
                : pathname.startsWith(it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                className={cn(
                  "mb-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition",
                  active
                    ? "bg-violet-700 text-white"
                    : "text-violet-200 hover:bg-violet-900",
                )}
              >
                <Icon className="h-4 w-4" />
                {it.label}
              </Link>
            );
          })}

          <Link
            href="/"
            className="mt-6 flex items-center gap-2 rounded-lg border border-violet-800 px-3 py-2 text-xs text-violet-300 hover:border-violet-600"
          >
            <ArrowLeft className="h-3 w-3" />
            Salir a panel del business
          </Link>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-violet-800 bg-violet-950/80 px-6 backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-violet-700 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider">
              Modo súper admin
            </span>
            <span className="text-xs text-violet-300">
              Sesión corta · 2FA obligatorio · auditada
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="font-medium">Wilson Rodríguez</span>
            <span className="rounded bg-violet-800 px-2 py-0.5 font-mono text-[10px]">
              platform_user
            </span>
          </div>
        </header>
        <main className="flex-1 px-6 py-6 lg:px-8 lg:py-8 text-violet-100">
          {children}
        </main>
      </div>
    </div>
  );
}
