"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui";
import { useCustomer } from "@/features/customers/customer-store";
import { CustomerForm } from "@/features/customers/customer-form";

/**
 * Edición de cliente.
 *
 * Los clientes usan Supabase cuando NEXT_PUBLIC_DATA_SOURCE=supabase;
 * en modo local caen al store por equipo (demo). Aplicamos el patrón
 * `mounted` para evitar hydration mismatch:
 * SSR y primer render cliente devuelven el mismo HTML estable
 * ("Cargando cliente..."); tras montar leemos el store y renderizamos el
 * formulario con `initial` o el card de "no encontrado".
 *
 * El formulario es el mismo que el de "Nuevo cliente" (`CustomerForm`),
 * en modo `edit`. Llama `updateCustomer` y excluye al propio cliente en
 * la detección de duplicados (`excludeClientId`), así no se detecta como
 * duplicado de sí mismo si el operario guarda sin cambiar
 * teléfono/documento.
 */
export default function EditarClientePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const c = useCustomer(id);

  if (!mounted) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <div className="rounded-2xl border bg-white p-6 text-center">
          <p className="text-sm opacity-70">Cargando cliente...</p>
        </div>
      </div>
    );
  }

  if (!c) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <PageHeader
          title="Cliente no encontrado"
          breadcrumbs={[
            { label: "Clientes", href: "/clientes" },
            { label: id },
            { label: "Editar" },
          ]}
        />
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm opacity-70">
              No encontramos el cliente con id <code>{id}</code>.
            </p>
            <Link
              href="/clientes"
              className="mt-4 inline-block text-sm text-[color:var(--brand-accent)] hover:underline"
            >
              ← Volver al listado
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Link
        href={`/clientes/${id}`}
        className="mb-4 inline-flex items-center gap-1 text-xs opacity-60 hover:opacity-100"
      >
        <ArrowLeft className="h-3 w-3" /> Volver al perfil
      </Link>

      <PageHeader
        title={`Editar ${c.firstName} ${c.lastName}`}
        description={c.customerNumber}
        breadcrumbs={[
          { label: "Clientes", href: "/clientes" },
          { label: c.customerNumber, href: `/clientes/${id}` },
          { label: "Editar" },
        ]}
      />

      <CustomerForm mode="edit" initial={c} />
    </div>
  );
}
