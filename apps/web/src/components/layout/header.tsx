"use client";

import * as React from "react";
import { Bell, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { mockBusiness, mockBranches } from "@/lib/mock-data/tenancy";
import { mockCurrentUser } from "@/lib/mock-data/users";

export function Header({ className }: { className?: string }) {
  const [branch, setBranch] = React.useState(mockBranches[0]?.id ?? "");
  const currentBranch = mockBranches.find((b) => b.id === branch);

  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-black/5 bg-white/80 px-6 backdrop-blur",
        className,
      )}
    >
      <div className="flex flex-1 items-center gap-4">
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
          <select
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs"
          >
            {mockBranches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          {currentBranch && (
            <span className="hidden lg:inline opacity-60">
              {currentBranch.address}
            </span>
          )}
        </div>

        <div className="ml-auto hidden lg:block max-w-md flex-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-40" />
            <input
              type="search"
              placeholder="Buscar producto, cliente, lote, e-NCF…"
              className="h-9 w-full rounded-lg border border-black/10 bg-black/[0.02] pl-9 pr-3 text-sm placeholder:text-black/40 focus:border-[color:var(--brand-primary)] focus:bg-white focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Notificaciones"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-black/5"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" />
        </button>
        <div className="flex items-center gap-2 rounded-lg border border-black/5 bg-white pl-1 pr-2 py-1">
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
        </div>
      </div>
    </header>
  );
}
