"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Skeleton,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { Merge, Plus, Users, X } from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import { FilterBar } from "@/components/ui/filter-bar";
import { RowActions } from "@/components/ui/row-actions";
import {
  SortableTH,
  useTableSort,
} from "@/components/ui/sortable-table-header";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import { useToast } from "@/components/ui/toast";
import { deleteCustomerAnywhere } from "@/features/customers/customer-store";
import { usePaginaClientes } from "@/features/customers/use-pagina-clientes";
import { coincideCliente, FUENTES } from "@/features/customers/customer-search";
import { insigniaCliente } from "@/features/customers/customer-flags";
import { puedeAccionDeRiesgo } from "@/features/auth/riesgo-operativo";
import { SelectorTipoPiel } from "@/features/customers/selector-tipo-piel";
import { useCurrentRole } from "@/features/auth/current-user";
import type { CustomerMetricsRow } from "@/features/customers/customer-metrics";
import { skinTypeOptions, skinTypeLabel } from "@/features/customers/billing";
import type { CustomerSkinType } from "@/types";
import {
  ALCANCE_TOTAL_GASTADO,
  ETIQUETA_TOTAL_GASTADO,
} from "@/features/customers/alcance-total-gastado";
import {
  formatCurrency,
  formatDate,
  formatNumber,
  relativeTime,
  isSameCalendarMonth,
} from "@/lib/utils/format";

// Compras / Total gastado / Última visita salen de la capa CENTRAL de
// métricas (mismos números que el perfil y el Reporte de Clientes) — antes
// leían columnas estáticas del cliente que nunca se actualizaban (RD$0.00).
const comparators = {
  createdAt: (a: CustomerMetricsRow, b: CustomerMetricsRow) =>
    +new Date(a.customer.createdAt) - +new Date(b.customer.createdAt),
  name: (a: CustomerMetricsRow, b: CustomerMetricsRow) =>
    `${a.customer.firstName} ${a.customer.lastName}`.localeCompare(
      `${b.customer.firstName} ${b.customer.lastName}`,
    ),
  totalOrders: (a: CustomerMetricsRow, b: CustomerMetricsRow) =>
    a.stats.purchases - b.stats.purchases,
  totalSpent: (a: CustomerMetricsRow, b: CustomerMetricsRow) =>
    a.stats.totalSpent - b.stats.totalSpent,
  lastVisit: (a: CustomerMetricsRow, b: CustomerMetricsRow) =>
    +new Date(a.stats.lastVisitAt ?? 0) - +new Date(b.stats.lastVisitAt ?? 0),
};

function ClientesContent() {
  const router = useRouter();
  // Deep-link desde el dashboard: `?created=this_month` abre la lista ya
  // filtrada a clientes registrados este mes. MISMA definición
  // (isSameCalendarMonth) que el KPI "Clientes nuevos".
  const params = useSearchParams();
  const createdFilter =
    params.get("created") === "this_month" ? "this_month" : "all";
  // 🔴 La página la arma el SERVIDOR: filtro, orden y corte. Antes esta pantalla
  // se bajaba los 6 523 clientes —siete idas y vueltas a PostgREST, ~1,8 s— para
  // filtrarlos y ordenarlos en el navegador. Ordenar por «total gastado» o
  // «última visita» obligaba a conocerlos todos antes de cortar la página; eso
  // ahora es un `order by`.
  const [orden, setOrden] = React.useState<
    "createdAt" | "name" | "totalOrders" | "totalSpent" | "lastVisit"
  >("createdAt");
  const [dir, setDir] = React.useState<"asc" | "desc">("desc");
  const [pagina, setPagina] = React.useState(0);
  const [porPagina, setPorPagina] = React.useState(25);
  const toast = useToast();
  const puedeRiesgo = puedeAccionDeRiesgo(useCurrentRole());

  // 🔴 Estos tres filtros existían en pantalla y no estaban conectados a nada:
  // un `<input>` sin valor ni manejador y dos `<select>` sueltos. Con 6 524
  // clientes eso dejaba la lista inservible — encontrar a alguien exigía pasar
  // páginas a mano.
  // 🔴 Lo buscado vive en la URL, no solo en memoria: al entrar a una ficha y
  // volver, la lista aparecía otra vez entera y había que teclear de nuevo. Con
  // esto el «Atrás» del navegador devuelve la búsqueda intacta, y el enlace se
  // puede guardar o pasar a alguien ya filtrado.
  const rutaActual = usePathname();
  const busqueda = params.get("q") ?? "";
  const fuente = params.get("fuente") ?? "";
  const tipoPiel = params.get("piel") ?? "";

  const cambiarFiltro = React.useCallback(
    (clave: "q" | "fuente" | "piel", valor: string) => {
      const siguientes = new URLSearchParams(params.toString());
      if (valor) siguientes.set(clave, valor);
      else siguientes.delete(clave);
      // `replace` y no `push`: teclear ocho letras no debe dejar ocho entradas
      // en el historial que haya que deshacer una a una.
      const qs = siguientes.toString();
      router.replace(qs ? `${rutaActual}?${qs}` : rutaActual, { scroll: false });
    },
    [params, router, rutaActual],
  );

  // Los tipos de piel del desplegable ya no se deducen de la lista (que ahora
  // es una página): se ofrecen todos los que el sistema conoce.
  const tiposDePiel = React.useMemo<CustomerSkinType[]>(
    () => skinTypeOptions.map((o) => o.value).filter((v) => v !== "not_specified"),
    [],
  );

  const consulta = usePaginaClientes({
    q: busqueda,
    fuente,
    piel: tipoPiel,
    creadosEsteMes: createdFilter === "this_month",
    orden,
    dir,
    pagina,
    limite: porPagina,
  });

  // Cualquier cambio de filtro vuelve a la primera página: sin esto, buscar
  // desde la página 7 deja la tabla vacía porque el resultado tiene menos.
  React.useEffect(() => {
    setPagina(0);
  }, [busqueda, fuente, tipoPiel, createdFilter, orden, dir, porPagina]);

  /** Pulsar una cabecera: misma columna invierte el sentido, otra empieza por descendente. */
  const toggle = React.useCallback(
    (columna: typeof orden) => {
      if (columna === orden) setDir((d) => (d === "asc" ? "desc" : "asc"));
      else {
        setOrden(columna);
        setDir("desc");
      }
    },
    [orden],
  );
  const sort = { key: orden, direction: dir };

  /** Lo que la tabla espera, pero servido por el servidor. */
  const pag = {
    pageItems: consulta.filas,
    page: pagina + 1,
    pageSize: porPagina,
    total: consulta.total,
    setPage: (n: number) => setPagina(Math.max(0, n - 1)),
    setPageSize: (n: number) => setPorPagina(n),
  };
  const hayFiltros = Boolean(busqueda || fuente || tipoPiel || createdFilter === "this_month");

  return (
    <>
      <PageHeader
        title="Clientes"
        description="CRM dermatológico — perfil completo con compras, recomendaciones y conversaciones WhatsApp."
        breadcrumbs={[{ label: "Clientes" }]}
        actions={
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium opacity-70">
              {consulta.cargando
                ? "Cargando…"
                : `${formatNumber(consulta.total)} cliente${consulta.total === 1 ? "" : "s"}`}
            </span>
            {puedeRiesgo && (
              <Link href="/clientes/unificar">
                <Button size="sm" variant="outline">
                  <Merge className="h-4 w-4" />
                  Unificar clientes
                </Button>
              </Link>
            )}
            <Link href="/clientes/nuevo">
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Nuevo cliente
              </Button>
            </Link>
          </div>
        }
      />

      {createdFilter === "this_month" && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[color:var(--brand-primary)]/30 bg-[color:var(--brand-primary)]/5 px-4 py-2.5 text-sm">
          <span>
            Mostrando: <strong>clientes nuevos de este mes</strong> ({consulta.total})
          </span>
          <Link href="/clientes">
            <Button variant="ghost" size="sm">
              <X className="h-4 w-4" /> Ver todos los clientes
            </Button>
          </Link>
        </div>
      )}

      <FilterBar className="mb-4">
        <SearchInput
          placeholder="Buscar por nombre, cédula, RNC, teléfono…"
          containerClassName="flex-1 min-w-[260px]"
          value={busqueda}
          onChange={(e) => cambiarFiltro("q", e.target.value)}
        />
        <select
          className="h-10 rounded-lg border border-black/15 bg-white px-3 text-sm"
          value={fuente}
          onChange={(e) => cambiarFiltro("fuente", e.target.value)}
        >
          <option value="">Todas las fuentes</option>
          {FUENTES.map((f) => (
            <option key={f.valor} value={f.valor}>
              {f.etiqueta}
            </option>
          ))}
        </select>
        <select
            className="h-10 rounded-lg border border-black/15 bg-white px-3 text-sm"
            value={tipoPiel}
            onChange={(e) => cambiarFiltro("piel", e.target.value)}
          >
          <option value="">Todos los tipos de piel</option>
          {tiposDePiel.map((t) => (
            <option key={t} value={t}>
              {skinTypeLabel(t)}
            </option>
          ))}
        </select>
      </FilterBar>

      {/* Qué cuenta «Total gastado» aquí. Sin esta línea, la misma etiqueta da
          un número en esta fila y otro en la ficha, a un clic de distancia. */}
      <p className="mb-3 text-xs opacity-60">{ALCANCE_TOTAL_GASTADO}</p>

      {consulta.cargando && <Skeleton className="h-64 rounded-xl" />}
      {consulta.error && (
        <Card>
          <CardContent className="py-6 text-sm text-rose-700">{consulta.error}</CardContent>
        </Card>
      )}

      {!consulta.cargando && !consulta.error && (pag.pageItems.length === 0 ? (
        <EmptyState
          icon={Users}
          title={hayFiltros ? "Sin resultados con estos filtros" : "Sin clientes aún"}
          description={
            hayFiltros
              ? "Ajusta la búsqueda o los filtros para ver más clientes."
              : "Cuando registres un cliente, aparecerá aquí."
          }
        />
      ) : (
      <Card>
        <CardContent className="p-0">
          {/* Móvil: tarjetas */}
          <div className="divide-y divide-slate-100 md:hidden">
            {pag.pageItems.map(({ customer: c, stats }) => (
              <Link
                key={c.id}
                href={`/clientes/${c.id}`}
                className="block px-4 py-3 active:bg-black/[0.03]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 font-medium">
                      <span className="truncate">
                        {c.firstName} {c.lastName}
                      </span>
                      {(() => {
                        const ins = insigniaCliente(c);
                        return ins ? <Badge tone={ins.tono}>{ins.texto}</Badge> : null;
                      })()}
                    </div>
                    <div className="font-mono text-xs opacity-60">{c.customerNumber}</div>
                    <div className="mt-1 text-xs opacity-70">
                      {c.phone ?? c.whatsapp ?? "—"}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <div
                      className="font-semibold tabular-nums text-[color:var(--brand-accent)]"
                      title={ALCANCE_TOTAL_GASTADO}
                    >
                      {formatCurrency(stats.totalSpent)}
                    </div>
                    <div className="text-[10px] opacity-50">
                      {stats.purchases} pedidos · solo sistema
                    </div>
                    {/* En móvil se queda como insignia: la tarjeta entera es
                        un enlace y meter un desplegable dentro pelea con el
                        toque. Se edita desde la ficha o desde la tabla. */}
                    <Badge tone="primary" outlined>
                      {skinTypeLabel(c.skinType)}
                    </Badge>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop: tabla */}
          <div className="hidden md:block">
          <Table>
            <THead>
              <TR>
                <SortableTH sortKey="createdAt" state={sort} onClick={toggle}>
                  Registrado
                </SortableTH>
                <SortableTH sortKey="name" state={sort} onClick={toggle}>
                  Cliente
                </SortableTH>
                <TH>Documento</TH>
                <TH>Contacto</TH>
                <TH>Tipo de piel</TH>
                <SortableTH
                  sortKey="totalOrders"
                  state={sort}
                  onClick={toggle}
                  align="right"
                >
                  Compras
                </SortableTH>
                <SortableTH
                  sortKey="totalSpent"
                  state={sort}
                  onClick={toggle}
                  align="right"
                >
                  {ETIQUETA_TOTAL_GASTADO}
                </SortableTH>
                <SortableTH
                  sortKey="lastVisit"
                  state={sort}
                  onClick={toggle}
                >
                  Última visita
                </SortableTH>
                <TH className="text-right pr-4">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {pag.pageItems.map(({ customer: c, stats }) => (
                <TR
                  key={c.id}
                  // Doble click sobre la fila → perfil. Single click no
                  // navega: los botones Ver/Editar/Eliminar y los enlaces
                  // del nombre siguen funcionando como antes.
                  onDoubleClick={() => router.push(`/clientes/${c.id}`)}
                  className="cursor-pointer transition hover:bg-black/[0.025]"
                  title="Doble clic para abrir el perfil"
                >
                  <TD className="text-xs opacity-70 whitespace-nowrap">
                    {formatDate(c.createdAt)}
                  </TD>
                  <TD>
                    <Link
                      href={`/clientes/${c.id}`}
                      onDoubleClick={(e) => e.stopPropagation()}
                      className="hover:text-[color:var(--brand-accent)]"
                    >
                      <div className="flex items-center gap-1.5 font-medium">
                        <span>
                          {c.firstName} {c.lastName}
                        </span>
                        {(() => {
                          const ins = insigniaCliente(c);
                          return ins ? <Badge tone={ins.tono}>{ins.texto}</Badge> : null;
                        })()}
                      </div>
                      <div className="text-xs opacity-60 font-mono">
                        {c.customerNumber}
                      </div>
                    </Link>
                  </TD>
                  <TD className="text-xs font-mono opacity-80">
                    {c.documentNumber ?? "—"}
                    {c.documentType && (
                      <span className="ml-1 text-[10px] opacity-50">
                        {c.documentType}
                      </span>
                    )}
                  </TD>
                  <TD>
                    <div className="text-xs">{c.phone ?? c.whatsapp ?? "—"}</div>
                    {c.email && (
                      <div className="text-xs opacity-60">{c.email}</div>
                    )}
                  </TD>
                  <TD onClick={(e) => e.stopPropagation()}>
                    {/* Editable en el sitio: entrar a la ficha, pulsar
                        «Editar», guardar y volver eran cuatro pasos para anotar
                        un dato de una palabra, y con 6 525 fichas casi todas
                        «No especificado» ese roce es la diferencia entre que se
                        llene y que no se llene nunca. */}
                    <SelectorTipoPiel
                      clienteId={c.id}
                      valor={c.skinType}
                      onGuardado={() => toast.success("Tipo de piel guardado.")}
                      onError={(m) => toast.error(m)}
                    />
                  </TD>
                  <TD className="text-right tabular-nums">{stats.purchases}</TD>
                  <TD className="text-right tabular-nums font-medium">
                    {formatCurrency(stats.totalSpent)}
                  </TD>
                  <TD className="text-xs opacity-70">
                    {stats.lastVisitAt ? relativeTime(stats.lastVisitAt) : "—"}
                  </TD>
                  <TD
                    className="pr-4"
                    // Evitar que un click/doble click sobre los botones de
                    // acción se interprete también como activación de la
                    // fila (que dispararía la navegación al perfil).
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                  >
                    {/* 🔴 Ver, siempre. Editar y borrar, solo administradores:
                        una cajera necesita consultar, no poder borrar la ficha
                        de un cliente con tres años de historial. Es una guarda
                        de INTERFAZ; la ruta que borra comprueba el rol aparte. */}
                    <RowActions
                      viewHref={`/clientes/${c.id}`}
                      editHref={`/clientes/${c.id}/editar`}
                      canEdit={puedeRiesgo}
                      canDelete={puedeRiesgo}
                      onDelete={async () => {
                        const res = await deleteCustomerAnywhere(c.id);
                        if (!res.ok)
                          toast.error(
                            res.error ?? "No se pudo eliminar el cliente.",
                          );
                        else toast.success("Cliente eliminado correctamente.");
                      }}
                      entityName={`${c.firstName} ${c.lastName}`}
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          </div>
          {consulta.total > 0 && (
            <DataPagination
              page={pag.page}
              pageSize={pag.pageSize}
              total={pag.total}
              onPageChange={pag.setPage}
              onPageSizeChange={pag.setPageSize}
            />
          )}
        </CardContent>
      </Card>
      ))}
      <toast.Toast />
    </>
  );
}

export default function ClientesPage() {
  return (
    <React.Suspense
      fallback={<div className="p-6 text-sm opacity-60">Cargando clientes…</div>}
    >
      <ClientesContent />
    </React.Suspense>
  );
}
