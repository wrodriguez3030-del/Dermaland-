import { PageHeader } from "@/components/layout/page-header";
import { StorefrontAdmin } from "@/features/storefront/components/admin/storefront-admin";
import { getRepoContext } from "@/server/auth/context";
import { loadAdminWebCatalog } from "@/server/services/storefront/admin";

/**
 * Administración de la tienda en línea (dentro del ERP).
 *
 * Dos cosas en una pantalla porque son la misma decisión: qué se publica y si la
 * tienda está encendida. Tenerlas separadas llevaría a publicar 600 productos y
 * no entender por qué no se ven.
 *
 * Los datos se leen en el servidor con la sesión del usuario (RLS acotando por
 * negocio); el gate de ROL vive en las rutas de API que escriben.
 */
export const dynamic = "force-dynamic";

export default async function TiendaWebPage() {
  const ctx = await getRepoContext();
  const catalogo = await loadAdminWebCatalog(ctx);

  return (
    <>
      <PageHeader
        title="Catálogo web"
        description="Qué productos se ven en la tienda en línea y cómo se presentan al cliente."
        breadcrumbs={[{ label: "Productos" }, { label: "Catálogo web" }]}
      />
      <StorefrontAdmin
        settings={catalogo.settings}
        products={catalogo.products}
        publishedCount={catalogo.publishedCount}
        publishableCount={catalogo.publishableCount}
      />
    </>
  );
}
