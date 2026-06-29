"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { Plus } from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import { FilterBar } from "@/components/ui/filter-bar";
import { RowActions } from "@/components/ui/row-actions";
import {
  SortableTH,
  useTableSort,
} from "@/components/ui/sortable-table-header";
import { DataPagination, usePagination } from "@/components/ui/data-pagination";
import { useToast } from "@/components/ui/toast";
import {
  deleteCustomerAnywhere,
  useCustomers,
} from "@/features/customers/customer-store";
import { skinTypeLabel } from "@/features/customers/billing";
import {
  formatCurrency,
  formatDate,
  relativeTime,
} from "@/lib/utils/format";
import type { Customer } from "@/types";

const comparators = {
  createdAt: (a: Customer, b: Customer) =>
    +new Date(a.createdAt) - +new Date(b.createdAt),
  name: (a: Customer, b: Customer) =>
    `${a.firstName} ${a.lastName}`.localeCompare(
      `${b.firstName} ${b.lastName}`,
    ),
  totalOrders: (a: Customer, b: Customer) => a.totalOrders - b.totalOrders,
  totalSpent: (a: Customer, b: Customer) => a.totalSpent - b.totalSpent,
  lastVisit: (a: Customer, b: Customer) =>
    +new Date(a.lastVisitAt ?? 0) - +new Date(b.lastVisitAt ?? 0),
};

export default function ClientesPage() {
  const router = useRouter();
  const customers = useCustomers();
  const toast = useToast();
  const { sort, sorted, toggle } = useTableSort(
    customers,
    "createdAt",
    "desc",
    comparators,
  );
  const pag = usePagination(sorted);

  return (
    <>
      <PageHeader
        title="Clientes"
        description="CRM dermatológico — perfil completo con compras, recomendaciones y conversaciones WhatsApp."
        breadcrumbs={[{ label: "Clientes" }]}
        actions={
          <Link href="/clientes/nuevo">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Nuevo cliente
            </Button>
          </Link>
        }
      />

      <FilterBar className="mb-4">
        <SearchInput
          placeholder="Buscar por nombre, cédula, RNC, teléfono…"
          containerClassName="flex-1 min-w-[260px]"
        />
        <select className="h-10 rounded-lg border border-black/15 bg-white px-3 text-sm">
          <option>Todas las fuentes</option>
          <option>Manual</option>
          <option>WhatsApp</option>
          <option>Web</option>
          <option>Importación</option>
        </select>
        <select className="h-10 rounded-lg border border-black/15 bg-white px-3 text-sm">
          <option>Todos los tipos de piel</option>
          <option>Sensible</option>
          <option>Acneica</option>
          <option>Madura</option>
        </select>
      </FilterBar>

      <Card>
        <CardContent className="p-0">
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
                  Total gastado
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
              {sorted.length === 0 && (
                <TR>
                  <TD colSpan={9} className="py-8 text-center text-sm opacity-60">
                    Sin clientes aún.
                  </TD>
                </TR>
              )}
              {pag.pageItems.map((c) => (
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
                      <div className="font-medium">
                        {c.firstName} {c.lastName}
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
                  <TD>
                    <Badge tone="primary" outlined>
                      {skinTypeLabel(c.skinType)}
                    </Badge>
                  </TD>
                  <TD className="text-right tabular-nums">{c.totalOrders}</TD>
                  <TD className="text-right tabular-nums font-medium">
                    {formatCurrency(c.totalSpent)}
                  </TD>
                  <TD className="text-xs opacity-70">
                    {c.lastVisitAt ? relativeTime(c.lastVisitAt) : "—"}
                  </TD>
                  <TD
                    className="pr-4"
                    // Evitar que un click/doble click sobre los botones de
                    // acción se interprete también como activación de la
                    // fila (que dispararía la navegación al perfil).
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                  >
                    <RowActions
                      viewHref={`/clientes/${c.id}`}
                      editHref={`/clientes/${c.id}/editar`}
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
          {sorted.length > 0 && (
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
      <toast.Toast />
    </>
  );
}
