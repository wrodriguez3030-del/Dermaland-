import { redirect } from "next/navigation";

/**
 * Alias legado del modo móvil. El escaneo real (cámara + lector + productos
 * reales, persistido en el conteo) vive en `/escanear`. Este server component
 * redirige ahí para no dar 404 con links viejos o cacheados por el PWA.
 *
 * (Antes esta ruta renderizaba un MobileScanner de demo contra el catálogo mock,
 * y devolvía 404 para conteos reales de localStorage en producción.)
 */
export default async function ConteoMovilRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/conteo-fisico/${id}/escanear`);
}
