import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui";
import { FormSection } from "@/components/ui/filter-bar";
import { BusinessForm } from "@/features/tenancy/business-form";
import { getRepoContext } from "@/server/auth/context";
import { getRepositories } from "@/server/repositories";
import { CompanyLogo } from "./company-logo";

/**
 * Administración → Empresa.
 *
 * Lee el negocio REAL del repositorio. Hasta ahora leía `mockBusiness`, así que
 * enseñaba los datos de otro negocio inventado y su botón de guardar no estaba
 * conectado a nada.
 */
export const dynamic = "force-dynamic";

export default async function EmpresaPage() {
  const ctx = await getRepoContext();
  const business = await getRepositories().business.current(ctx);

  return (
    <>
      <PageHeader
        title="Empresa"
        description="Datos del negocio. Estos campos se usan en facturas, recibos y comprobantes."
        breadcrumbs={[{ label: "Administración" }, { label: "Empresa" }]}
      />

      {business ? (
        <>
          <BusinessForm business={business} />
          <Card className="mt-6">
            <CardContent>
              <FormSection
                title="Logo"
                description="Logo institucional usado en facturas, recibos, PDF y comprobantes."
              >
                <CompanyLogo
                  initialLogo={business.logoUrl}
                  businessName={business.commercialName}
                />
              </FormSection>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent>
            <p className="py-8 text-center text-sm text-black/60">
              No se pudieron cargar los datos de la empresa.
            </p>
          </CardContent>
        </Card>
      )}
    </>
  );
}
