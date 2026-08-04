import type { MetadataRoute } from "next";

/**
 * Qué puede rastrear un buscador.
 *
 * R-WEB-03: cada rama abierta genera un despliegue Preview con URL pública y
 * los MISMOS datos que producción. Si Google indexara uno, el catálogo real
 * aparecería en resultados bajo un dominio efímero que mañana da 404 —y que
 * además compite con el dominio bueno por el mismo contenido—. Fuera de
 * producción, aquí no se rastrea nada; la segunda capa es la cabecera
 * `X-Robots-Tag: noindex` de `next.config.ts`, que actúa aunque el buscador
 * llegue por un enlace directo sin leer este archivo.
 *
 * En producción solo se abre la tienda. El ERP está tras sesión, pero además se
 * le dice explícitamente al rastreador que no pierda el tiempo: cada URL
 * intentada acaba en un redirect a `/login`.
 */
export default function robots(): MetadataRoute.Robots {
  const esProduccion = process.env.VERCEL_ENV === "production";

  if (!esProduccion) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/tienda"],
        disallow: [
          "/",
          "/login",
          "/recuperar",
          "/restablecer",
          "/factura",
          "/api/",
          "/super-admin",
        ],
      },
    ],
  };
}
