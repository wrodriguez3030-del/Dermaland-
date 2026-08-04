// De qué dirección se cuelga la tienda.
//
// Esto no es un detalle de configuración: de aquí salen las URL **canónicas**,
// el `sitemap.xml`, el enlace al sitemap dentro de `robots.txt`, los datos
// estructurados y el mensaje de WhatsApp que se lleva el cliente. Si devuelve
// `http://localhost:3031` en producción —que es lo que pasaba, porque
// `NEXT_PUBLIC_APP_URL` no está definida en Vercel— el daño no es cosmético:
// una canónica a localhost le dice a Google que la página buena está en otro
// sitio, y el sitemap deja de servir para nada.
//
// Se sigue la regla que ya usa el resto del proyecto (DL-20): la base
// configurada manda, pero solo si NO es localhost; si no, se usa el dominio que
// la propia plataforma conoce. Es una función pura para poder probar los cuatro
// casos sin desplegar.

/** Variables de entorno que deciden la dirección pública. */
export interface BaseUrlEnv {
  /** `NEXT_PUBLIC_APP_URL`. En local trae el valor por defecto. */
  appUrl?: string;
  /** `VERCEL_PROJECT_PRODUCTION_URL`: el dominio de producción del proyecto. */
  vercelProductionUrl?: string;
  /** `VERCEL_URL`: el dominio de ESTE despliegue (Preview incluido). */
  vercelUrl?: string;
}

const LOCAL = "http://localhost:3031";

function limpiar(url: string): string {
  return url.replace(/\/+$/, "");
}

export function resolveBaseUrl(env: BaseUrlEnv): string {
  const configurada = env.appUrl?.trim();
  // Configurada y real: manda. Es la única forma de servir la tienda desde un
  // dominio propio (dermaland.com.do) en vez del de Vercel.
  if (configurada && !configurada.includes("localhost")) return limpiar(configurada);

  // En Vercel se prefiere el dominio de PRODUCCIÓN, no el del despliegue: las
  // canónicas de un Preview deben apuntar al sitio bueno, no a una URL efímera
  // que mañana da 404.
  if (env.vercelProductionUrl) return `https://${limpiar(env.vercelProductionUrl)}`;
  if (env.vercelUrl) return `https://${limpiar(env.vercelUrl)}`;

  return configurada ? limpiar(configurada) : LOCAL;
}
