"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Eye, EyeOff, Pencil, Search, Star } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/utils/format";
import { normalizeForSearch } from "../../catalog-query";
import type {
  AdminWebProduct,
  StorefrontSettings,
} from "@/server/services/storefront/admin";
import { ProductWebMetaModal } from "./product-web-meta-modal";
import { StorefrontSettingsForm } from "./storefront-settings-form";

/**
 * Pantalla de administración de la tienda.
 *
 * Trabaja sobre la lista COMPLETA en memoria (cientos de filas, ya cargadas por
 * el servidor): buscar y paginar aquí evita un viaje a la base por cada letra
 * tecleada, que es como se siente lento un buscador.
 */

/** Filas por página. Suficiente para trabajar sin marear. */
const POR_PAGINA = 25;

type Filtro = "todos" | "publicados" | "ocultos" | "bloqueados";

const FILTROS: { valor: Filtro; etiqueta: string }[] = [
  { valor: "todos", etiqueta: "Todos" },
  { valor: "publicados", etiqueta: "Publicados" },
  { valor: "ocultos", etiqueta: "Ocultos" },
  { valor: "bloqueados", etiqueta: "No publicables" },
];

export function StorefrontAdmin({
  settings,
  products,
  publishedCount,
  publishableCount,
}: {
  settings: StorefrontSettings | null;
  products: AdminWebProduct[];
  publishedCount: number;
  publishableCount: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busqueda, setBusqueda] = React.useState("");
  const [filtro, setFiltro] = React.useState<Filtro>("todos");
  const [pagina, setPagina] = React.useState(1);
  const [editando, setEditando] = React.useState<AdminWebProduct | null>(null);
  const [guardando, setGuardando] = React.useState<string | null>(null);

  const filtrados = React.useMemo(() => {
    const termino = normalizeForSearch(busqueda);
    return products.filter((p) => {
      if (filtro === "publicados" && !p.visible) return false;
      if (filtro === "ocultos" && (p.visible || p.blockers.length > 0))
        return false;
      if (filtro === "bloqueados" && p.blockers.length === 0) return false;
      if (!termino) return true;
      return normalizeForSearch(`${p.name} ${p.brandName ?? ""}`).includes(
        termino,
      );
    });
  }, [products, busqueda, filtro]);

  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const paginaActual = Math.min(pagina, paginas);
  const visibles = filtrados.slice(
    (paginaActual - 1) * POR_PAGINA,
    paginaActual * POR_PAGINA,
  );

  async function guardar(
    producto: AdminWebProduct,
    cambios: Record<string, unknown>,
  ) {
    setGuardando(producto.productId);
    try {
      const res = await fetch(
        `/api/storefront/products/${producto.productId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cambios),
        },
      );
      const cuerpo = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(cuerpo.error ?? "No se pudo guardar.");
        return false;
      }
      // El servidor ya invalidó la caché de la tienda; `refresh` trae la lista
      // recién leída para que lo que se ve aquí sea lo que hay.
      router.refresh();
      return true;
    } catch {
      toast.error(
        "No se pudo conectar. Revisa la conexión e intenta de nuevo.",
      );
      return false;
    } finally {
      setGuardando(null);
    }
  }

  /**
   * Publicar o retirar en lote.
   *
   * Con 638 fichas, hacerlo de una en una son 638 clics. La regla no se relaja:
   * el servidor filtra los no publicables y devuelve cuántos quedaron fuera.
   */
  async function enLote(visible: boolean) {
    const objetivo = visible
      ? products.filter((p) => !p.visible && p.blockers.length === 0)
      : products.filter((p) => p.visible);
    if (objetivo.length === 0) return;

    const confirmado = window.confirm(
      visible
        ? `Se publicarán ${objetivo.length} producto(s) en la tienda. ¿Continuar?`
        : `Se retirarán de la tienda ${objetivo.length} producto(s). ¿Continuar?`,
    );
    if (!confirmado) return;

    setGuardando("lote");
    try {
      const res = await fetch("/api/storefront/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productIds: objetivo.map((p) => p.productId),
          visible,
        }),
      });
      const cuerpo = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(cuerpo.error ?? "No se pudo actualizar.");
        return;
      }
      const omitidos = cuerpo.skipped?.length ?? 0;
      toast.success(
        omitidos > 0
          ? `${cuerpo.updated} actualizados. ${omitidos} no se pudieron publicar.`
          : `${cuerpo.updated} producto(s) actualizados.`,
      );
      router.refresh();
    } catch {
      toast.error(
        "No se pudo conectar. Revisa la conexión e intenta de nuevo.",
      );
    } finally {
      setGuardando(null);
    }
  }

  return (
    <div className="space-y-6">
      <StorefrontSettingsForm
        settings={settings}
        publishedCount={publishedCount}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Productos</CardTitle>
              <CardDescription>
                {publishedCount} publicados · {publishableCount} listos para
                publicar · {products.length} en el catálogo web
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {publishableCount > 0 ? (
                <Button
                  variant="outline"
                  disabled={guardando === "lote"}
                  onClick={() => void enLote(true)}
                >
                  Publicar los {publishableCount} listos
                </Button>
              ) : null}
              {publishedCount > 0 ? (
                <Button
                  variant="ghost"
                  disabled={guardando === "lote"}
                  onClick={() => void enLote(false)}
                >
                  Retirar todos
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <Label htmlFor="buscar-web">Buscar</Label>
              <div className="relative">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--brand-fg)]/40"
                />
                <Input
                  id="buscar-web"
                  value={busqueda}
                  onChange={(e) => {
                    setBusqueda(e.target.value);
                    setPagina(1);
                  }}
                  placeholder="Nombre o marca"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {FILTROS.map((f) => (
                <button
                  key={f.valor}
                  type="button"
                  onClick={() => {
                    setFiltro(f.valor);
                    setPagina(1);
                  }}
                  aria-pressed={filtro === f.valor}
                  className={
                    filtro === f.valor
                      ? "min-h-11 cursor-pointer rounded-xl bg-[color:var(--brand-primary)] px-4 text-sm font-semibold text-white"
                      : "min-h-11 cursor-pointer rounded-xl border border-black/10 px-4 text-sm font-medium text-[color:var(--brand-fg)]/70 hover:border-[color:var(--brand-accent)]"
                  }
                >
                  {f.etiqueta}
                </button>
              ))}
            </div>
          </div>

          {visibles.length === 0 ? (
            <p className="py-12 text-center text-sm text-[color:var(--brand-fg)]/60">
              Ningún producto coincide con la búsqueda.
            </p>
          ) : (
            <ul className="divide-y divide-black/5">
              {visibles.map((producto) => (
                <FilaProducto
                  key={producto.productId}
                  producto={producto}
                  ocupado={guardando === producto.productId}
                  onPublicar={(visible) => guardar(producto, { visible })}
                  onDestacar={(featured) => guardar(producto, { featured })}
                  onEditar={() => setEditando(producto)}
                />
              ))}
            </ul>
          )}

          {paginas > 1 ? (
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={paginaActual <= 1}
                onClick={() => setPagina(paginaActual - 1)}
              >
                Anterior
              </Button>
              <span className="text-sm text-[color:var(--brand-fg)]/70">
                Página {paginaActual} de {paginas}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={paginaActual >= paginas}
                onClick={() => setPagina(paginaActual + 1)}
              >
                Siguiente
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <ProductWebMetaModal
        producto={editando}
        onCerrar={() => setEditando(null)}
        onGuardar={async (cambios) => {
          if (!editando) return false;
          const ok = await guardar(editando, cambios);
          if (ok) {
            toast.success("Ficha web actualizada.");
            setEditando(null);
          }
          return ok;
        }}
      />
      <toast.Toast />
    </div>
  );
}

function FilaProducto({
  producto,
  ocupado,
  onPublicar,
  onDestacar,
  onEditar,
}: {
  producto: AdminWebProduct;
  ocupado: boolean;
  onPublicar: (visible: boolean) => void;
  onDestacar: (featured: boolean) => void;
  onEditar: () => void;
}) {
  const bloqueado = producto.blockers.length > 0;

  return (
    <li className="flex flex-wrap items-center gap-4 py-3">
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-black/5 bg-white">
        {producto.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={producto.imageUrl}
            alt=""
            className="h-full w-full object-contain"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-[color:var(--brand-fg)]/40">
            Sin foto
          </div>
        )}
      </div>

      <div className="min-w-48 flex-1">
        <p className="text-sm font-medium text-[color:var(--brand-fg)]">
          {producto.webTitle ?? producto.name}
        </p>
        <p className="text-xs text-[color:var(--brand-fg)]/60">
          {producto.brandName ? `${producto.brandName} · ` : ""}
          {formatCurrency(producto.price)}
        </p>
        {bloqueado ? (
          // El motivo se escribe entero: un interruptor apagado que no se deja
          // encender, sin explicación, es la peor forma de dar una noticia.
          <p className="mt-1 text-xs text-[color:var(--brand-danger)]">
            No publicable: {producto.blockers.join(". ")}.
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {producto.visible ? (
          <Badge tone="success">Publicado</Badge>
        ) : (
          <Badge tone="neutral">Oculto</Badge>
        )}
        {producto.featured ? <Badge tone="info">Destacado</Badge> : null}
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={ocupado || (bloqueado && !producto.visible)}
          onClick={() => onPublicar(!producto.visible)}
          title={
            bloqueado && !producto.visible
              ? `No se puede publicar: ${producto.blockers.join(". ")}`
              : producto.visible
                ? "Quitar de la tienda"
                : "Publicar en la tienda"
          }
        >
          {producto.visible ? (
            <EyeOff aria-hidden className="h-4 w-4" />
          ) : (
            <Eye aria-hidden className="h-4 w-4" />
          )}
          <span className="sr-only">
            {producto.visible ? "Quitar de la tienda" : "Publicar en la tienda"}
          </span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          disabled={ocupado || !producto.visible}
          onClick={() => onDestacar(!producto.featured)}
          title={
            producto.featured ? "Quitar de destacados" : "Destacar en la tienda"
          }
        >
          <Star
            aria-hidden
            className={
              producto.featured
                ? "h-4 w-4 fill-[color:var(--brand-warn)] text-[color:var(--brand-warn)]"
                : "h-4 w-4"
            }
          />
          <span className="sr-only">
            {producto.featured
              ? "Quitar de destacados"
              : "Destacar en la tienda"}
          </span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onEditar}
          title="Editar ficha web"
        >
          <Pencil aria-hidden className="h-4 w-4" />
          <span className="sr-only">Editar ficha web</span>
        </Button>

        {producto.visible ? (
          <a
            href={`/tienda/producto/${producto.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Ver en la tienda"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[color:var(--brand-fg)]/60 hover:bg-black/5 hover:text-[color:var(--brand-primary)]"
          >
            <ExternalLink aria-hidden className="h-4 w-4" />
            <span className="sr-only">Ver en la tienda</span>
          </a>
        ) : null}
      </div>
    </li>
  );
}
