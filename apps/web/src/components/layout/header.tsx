"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { MobileNav } from "./mobile-nav";
import { GlobalSearch, GlobalSearchMobile } from "@/features/search/global-search";
import { mockBusiness } from "@/lib/mock-data/tenancy";
import { mockCurrentUser } from "@/lib/mock-data/users";
import {
  useCurrentBranch,
  readCachedCurrentBranchName,
} from "@/features/tenancy/branch-store";

export function Header({
  className,
  showSuperAdmin = true,
}: {
  className?: string;
  showSuperAdmin?: boolean;
}) {
  const {
    branchId: branch,
    branches,
    setBranchId: setBranch,
    loading,
    notice,
    dismissNotice,
  } = useCurrentBranch();
  const currentBranch = branches.find((b) => b.id === branch);

  // Nombre cacheado (solo para mostrar mientras carga, sin parpadeo). Se lee
  // tras montar para no romper la hidratación (server no tiene localStorage).
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const cachedName = mounted ? readCachedCurrentBranchName() : null;

  // Estado del selector:
  //  - cargando + aún sin lista → "Cargando sucursales…" (o el nombre cacheado).
  //  - sin sucursales tras cargar → "Sin sucursales".
  //  - con sucursales → select normal.
  const isLoadingBranches = loading && branches.length === 0;

  return (
    <>
      {notice && (
        <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-6 py-2 text-xs text-amber-900">
          <span>{notice}</span>
          <button
            type="button"
            onClick={dismissNotice}
            className="rounded px-2 py-0.5 font-medium hover:bg-amber-100"
          >
            Entendido
          </button>
        </div>
      )}
      <header
        className={cn(
          // Sin backdrop-blur: backdrop-filter crea un containing block para
          // los descendientes position:fixed y confinaba el drawer móvil dentro
          // del header. Fondo sólido + el drawer además va por portal a body.
          "sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-black/5 bg-white px-4 md:px-6",
          className,
        )}
      >
      <div className="flex flex-1 items-center gap-2 md:gap-4">
        <MobileNav showSuperAdmin={showSuperAdmin} />
        {mockBusiness.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mockBusiness.logoUrl}
            alt={mockBusiness.commercialName}
            className="h-8 w-8 shrink-0 object-contain"
          />
        )}
        <div className="hidden md:flex items-center gap-2 text-xs">
          <span className="rounded-full bg-[color:var(--brand-primary)]/10 px-2.5 py-0.5 font-medium text-[color:var(--brand-accent)]">
            {mockBusiness.commercialName}
          </span>
          <span className="opacity-40">·</span>
          {isLoadingBranches ? (
            <span className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs opacity-60">
              {cachedName ?? "Cargando sucursales…"}
            </span>
          ) : branches.length === 0 ? (
            <span className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs opacity-60">
              Sin sucursales
            </span>
          ) : (
            <select
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          {currentBranch && (
            <span className="hidden lg:inline opacity-60">
              {currentBranch.address}
            </span>
          )}
        </div>

        {/* Buscador global (escritorio): input inline + dropdown. */}
        <GlobalSearch className="ml-auto hidden lg:block max-w-md flex-1" />
      </div>

      <div className="flex items-center gap-2">
        {/* Buscador global (móvil/tablet): icono lupa → panel completo. */}
        <GlobalSearchMobile className="lg:hidden" />
        <button
          type="button"
          aria-label="Notificaciones"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-black/5"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" />
        </button>
        <Link
          href="/perfil/seguridad"
          title="Seguridad de la cuenta (2FA)"
          className="flex items-center gap-2 rounded-lg border border-black/5 bg-white pl-1 pr-2 py-1 hover:bg-black/[0.02]"
        >
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white"
            style={{ background: mockCurrentUser.avatarColor }}
          >
            {mockCurrentUser.fullName
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </span>
          <div className="hidden lg:block">
            <div className="text-xs font-medium leading-tight">
              {mockCurrentUser.fullName}
            </div>
            <div className="text-[10px] uppercase tracking-wider opacity-50">
              {mockCurrentUser.role.replace("_", " ")}
            </div>
          </div>
          <ChevronDown className="h-3 w-3 opacity-40" />
        </Link>
      </div>
      </header>
    </>
  );
}
