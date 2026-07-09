"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Boxes, FileText, Loader2, Package, Receipt, User } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui";
import type { GlobalSearchResults, SearchGroupKind } from "@/features/search/search-types";
import { hasEnoughChars } from "@/features/search/search-core";

const KIND_ICON: Record<SearchGroupKind, React.ComponentType<{ className?: string }>> = {
  product: Package,
  customer: User,
  invoice: Receipt,
  proforma: FileText,
  lot: Boxes,
};

function BuscarResults() {
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const [state, setState] = React.useState<
    | { status: "idle" | "loading" }
    | { status: "success"; results: GlobalSearchResults }
    | { status: "error" }
  >({ status: "idle" });

  React.useEffect(() => {
    if (!hasEnoughChars(q)) {
      setState({ status: "idle" });
      return;
    }
    const ctrl = new AbortController();
    setState({ status: "loading" });
    fetch(`/api/search?q=${encodeURIComponent(q)}&perGroup=40`, {
      signal: ctrl.signal,
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as GlobalSearchResults;
      })
      .then((results) => setState({ status: "success", results }))
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setState({ status: "error" });
      });
    return () => ctrl.abort();
  }, [q]);

  if (!hasEnoughChars(q)) {
    return (
      <Card>
        <CardContent>
          <p className="py-8 text-center text-sm opacity-60">
            Escribe al menos 2 caracteres en la barra de búsqueda.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (state.status === "error") {
    return (
      <Card>
        <CardContent>
          <p className="py-8 text-center text-sm text-rose-600">
            No se pudo realizar la búsqueda. Intenta nuevamente.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (state.status !== "success") {
    return (
      <Card>
        <CardContent>
          <div className="flex items-center justify-center gap-2 py-10 text-sm opacity-60">
            <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
          </div>
        </CardContent>
      </Card>
    );
  }

  if (state.results.total === 0) {
    return (
      <Card>
        <CardContent>
          <p className="py-8 text-center text-sm opacity-70">
            No encontramos resultados para “{q.trim()}”.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {state.results.groups.map((group) => {
        const Icon = KIND_ICON[group.kind];
        return (
          <Card key={group.kind}>
            <CardContent>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Icon className="h-4 w-4 opacity-60" /> {group.label}
                <span className="opacity-40">· {group.items.length}</span>
              </div>
              <div className="divide-y divide-black/5">
                {group.items.map((item) => (
                  <Link
                    key={`${item.kind}-${item.id}`}
                    href={item.href}
                    className="flex items-center gap-3 py-2 hover:bg-black/[0.02]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.title}</span>
                      {item.subtitle && (
                        <span className="block truncate text-xs opacity-60">{item.subtitle}</span>
                      )}
                    </span>
                    {item.meta && (
                      <span className="shrink-0 text-xs tabular-nums opacity-60">{item.meta}</span>
                    )}
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default function BuscarPage() {
  return (
    <>
      <PageHeader
        title="Resultados de búsqueda"
        description="Productos, clientes, facturas, proformas y lotes de todo el negocio."
        breadcrumbs={[{ label: "Buscar" }]}
      />
      <React.Suspense fallback={null}>
        <BuscarResults />
      </React.Suspense>
    </>
  );
}
