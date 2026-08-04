import Link from "next/link";
import { redirect } from "next/navigation";
import { PackageSearch } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, Card, CardContent, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { RowActions } from "@/components/ui/row-actions";
import {
  WEB_ORDER_STATUSES,
  webOrderStatusLabel,
  type WebOrderStatus,
} from "@/features/storefront/orders/status";
import { formatCurrency } from "@/lib/utils/format";
import { getSession } from "@/server/auth/context";
import {
  listWebOrders,
  WEB_ORDERS_PAGE_SIZE,
} from "@/server/services/storefront/orders";

/**
 * Pedidos de la tienda en línea.
 *
 * Server Component leyendo el servicio directamente: no hace falta una ruta de
 * API para LEER, y así la lista no pasa por el navegador antes de existir.
 *
 * Paginada en el SERVIDOR con `.range()`: sin él PostgREST corta en 1000 filas
 * en silencio y la pantalla enseñaría un subconjunto sin decir que lo es.
 */

export const dynamic = "force-dynamic";

/** Los estados que de verdad se filtran a diario. */
const FILTROS: Array<{ valor: WebOrderStatus | "todos"; etiqueta: string }> = [
  { valor: "todos", etiqueta: "Todos" },
  ...WEB_ORDER_STATUSES.map((s) => ({
    valor: s,
    etiqueta: webOrderStatusLabel(s),
  })),
];

function esEstado(v: string | undefined): v is WebOrderStatus {
  return !!v && (WEB_ORDER_STATUSES as readonly string[]).includes(v);
}

export default async function PedidosWebPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; pagina?: string }>;
}) {
  const sp = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login?next=/pedidos-web");

  const estado = esEstado(sp.estado) ? sp.estado : undefined;
  const pagina = Math.max(1, Number.parseInt(sp.pagina ?? "1", 10) || 1);

  const { rows, total } = await listWebOrders(session.businessId, {
    page: pagina,
    status: estado,
  });
  const paginas = Math.max(1, Math.ceil(total / WEB_ORDERS_PAGE_SIZE));

  const href = (cambios: { estado?: string; pagina?: number }) => {
    const p = new URLSearchParams();
    const e = "estado" in cambios ? cambios.estado : estado;
    if (e && e !== "todos") p.set("estado", e);
    const n = cambios.pagina ?? 1;
    if (n > 1) p.set("pagina", String(n));
    const s = p.toString();
    return s ? `/pedidos-web?${s}` : "/pedidos-web";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pedidos web"
        description="Lo que los clientes piden desde la tienda en línea. El cobro se hace en el POS cuando vienen a retirar."
      />

      <nav aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
        {FILTROS.map((f) => {
          const activo = (estado ?? "todos") === f.valor;
          return (
            <Link
              key={f.valor}
              href={href({ estado: f.valor === "todos" ? undefined : f.valor })}
              aria-current={activo ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-medium ${
                activo
                  ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]/5 text-[color:var(--brand-primary)]"
                  : "border-black/10 bg-white text-[color:var(--brand-fg)] hover:border-[color:var(--brand-primary)]"
              }`}
            >
              {f.etiqueta}
            </Link>
          );
        })}
      </nav>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <PackageSearch
                aria-hidden
                className="mx-auto h-10 w-10 text-[color:var(--brand-fg)]/30"
              />
              <p className="mt-4 font-semibold text-[color:var(--brand-fg)]">
                {estado
                  ? `Ningún pedido en "${webOrderStatusLabel(estado)}"`
                  : "Todavía no hay pedidos web"}
              </p>
              <p className="mt-1 text-sm text-[color:var(--brand-fg)]/60">
                Aparecerán aquí en cuanto un cliente envíe uno desde la tienda.
              </p>
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Pedido</TH>
                  <TH>Cliente</TH>
                  <TH>Retira en</TH>
                  <TH>Total</TH>
                  <TH>Estado</TH>
                  <TH>Acciones</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((p) => (
                  <TR key={p.id}>
                    <TD>
                      <Link
                        href={`/pedidos-web/${p.id}`}
                        className="font-semibold text-[color:var(--brand-primary)] underline-offset-4 hover:underline"
                      >
                        {p.number}
                      </Link>
                      <span className="block text-xs text-[color:var(--brand-fg)]/50">
                        {new Date(p.createdAt).toLocaleDateString("es-DO")}
                      </span>
                    </TD>
                    <TD>
                      {p.contactName}
                      <span className="block text-xs text-[color:var(--brand-fg)]/50">
                        {p.contactPhone}
                      </span>
                    </TD>
                    <TD>{p.branchName}</TD>
                    <TD className="font-semibold">{formatCurrency(p.total)}</TD>
                    <TD>
                      <Badge
                        tone={
                          p.status === "cancelado"
                            ? "neutral"
                            : p.status === "entregado"
                              ? "success"
                              : "info"
                        }
                      >
                        {webOrderStatusLabel(p.status)}
                      </Badge>
                    </TD>
                    <TD>
                      {/* Iconos con tooltip, nunca texto: es la norma de las
                          columnas de acciones en todo el ERP. */}
                      <RowActions
                        variant="inline"
                        viewHref={`/pedidos-web/${p.id}`}
                        itemLabel={`pedido ${p.number}`}
                      />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {paginas > 1 ? (
        <nav
          aria-label="Páginas de pedidos"
          className="flex items-center justify-center gap-3"
        >
          {pagina > 1 ? (
            <Link
              href={href({ pagina: pagina - 1 })}
              rel="prev"
              className="inline-flex min-h-11 items-center rounded-xl border border-black/10 bg-white px-4 text-sm font-medium"
            >
              Anterior
            </Link>
          ) : null}
          <p className="text-sm text-[color:var(--brand-fg)]/70">
            Página <strong>{pagina}</strong> de {paginas} · {total} pedidos
          </p>
          {pagina < paginas ? (
            <Link
              href={href({ pagina: pagina + 1 })}
              rel="next"
              className="inline-flex min-h-11 items-center rounded-xl border border-black/10 bg-white px-4 text-sm font-medium"
            >
              Siguiente
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
