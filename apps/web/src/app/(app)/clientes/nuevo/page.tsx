import { PageHeader } from "@/components/layout/page-header";
import { NewCustomerForm } from "@/features/customers/new-customer-form";

export default function NuevoClientePage() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Nuevo cliente"
        description="Crea perfil de paciente/cliente. Datos editables luego desde el perfil."
        breadcrumbs={[
          { label: "Clientes", href: "/clientes" },
          { label: "Nuevo" },
        ]}
      />
      <NewCustomerForm />
    </div>
  );
}
