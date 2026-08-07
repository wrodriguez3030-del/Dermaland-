/**
 * Normalización de los enlaces públicos de una sucursal (Google Maps e
 * Instagram).
 *
 * Existe porque nadie pega una URL limpia. De Google Maps llega el enlace
 * corto de «Compartir», la barra del navegador con cuarenta parámetros, o el
 * texto completo del botón compartir de Android —«DermaLand Principal
 * https://maps.app.goo.gl/abc»—. De Instagram llega `@dermaland`, `dermaland`
 * a secas, la URL con `?igsh=` de la app, o el perfil copiado del navegador.
 * Todos son intentos correctos del dueño del negocio y todos deben funcionar.
 *
 * SEGURIDAD: lo que sale de aquí termina en un `href` de una página pública.
 * Por eso el resultado nunca es «lo que el usuario escribió»: es una URL
 * reconstruida por nosotros, siempre `https`, y sólo hacia dominios de una
 * lista blanca. Un `javascript:` o un `data:` no sobreviven a la comprobación
 * de protocolo, y un `https://sitio-de-phishing.com` no sobrevive a la de
 * dominio. Es deliberado que la lista sea corta: el campo se llama «enlace de
 * Google Maps», no «enlace».
 */

/** Resultado de normalizar. `undefined` en `url` = el campo quedó vacío. */
export type ResultadoEnlace =
  | { ok: true; url: string | undefined }
  | { ok: false; error: string };

/**
 * Dominios que Google usa para Maps. `maps.app.goo.gl` es el que produce hoy
 * el botón «Compartir» del móvil; `goo.gl/maps` es el corto antiguo, que sigue
 * vivo en enlaces guardados hace años.
 *
 * Se comparan por igualdad exacta, nunca con `endsWith`: `endsWith("google.com")`
 * también acepta `evilgoogle.com`.
 */
const DOMINIOS_MAPS = new Set([
  "google.com",
  "www.google.com",
  "maps.google.com",
  "maps.app.goo.gl",
  "goo.gl",
  "g.co",
]);

/** Dominios de Google por país: `google.com.do`, `google.es`, `google.co.uk`… */
const DOMINIO_GOOGLE_PAIS =
  /^(?:www\.|maps\.)?google\.(?:[a-z]{2,3})(?:\.[a-z]{2})?$/;

function esDominioDeMaps(host: string): boolean {
  const limpio = host.toLowerCase();
  return DOMINIOS_MAPS.has(limpio) || DOMINIO_GOOGLE_PAIS.test(limpio);
}

/**
 * Primera URL que aparece dentro de un texto.
 *
 * El botón «Compartir» de Android manda el nombre del sitio y luego el
 * enlace. Pedirle al usuario que borre el texto sobrante es pedirle que haga
 * de parser; lo hacemos nosotros.
 */
function extraerUrl(texto: string): string | undefined {
  const encontrado = texto.match(/https?:\/\/[^\s<>"']+/i);
  return encontrado?.[0];
}

/**
 * Enlace de Google Maps listo para publicar, o un error explicado.
 *
 * Devuelve `{ ok: true, url: undefined }` cuando el campo se deja en blanco:
 * borrar el enlace es una acción legítima, no un error.
 */
export function normalizeMapsUrl(entrada: string | null | undefined): ResultadoEnlace {
  const texto = (entrada ?? "").trim();
  if (!texto) return { ok: true, url: undefined };

  const candidato = extraerUrl(texto) ?? texto;

  let url: URL;
  try {
    // Sin protocolo la gente pega `maps.app.goo.gl/abc`. `https` es la única
    // suposición segura: nunca degradamos a `http`.
    url = new URL(/^https?:\/\//i.test(candidato) ? candidato : `https://${candidato}`);
  } catch {
    return {
      ok: false,
      error: "Eso no parece un enlace. Copia el enlace desde Google Maps con el botón «Compartir».",
    };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, error: "El enlace debe empezar por https://" };
  }
  if (!esDominioDeMaps(url.hostname)) {
    return {
      ok: false,
      error: `El enlace debe ser de Google Maps (recibimos «${url.hostname}»). Usa el botón «Compartir» en Google Maps y pega lo que copia.`,
    };
  }

  // Se fuerza `https` incluso si pegaron `http`: el enlace se publica, y un
  // enlace público en claro es gratis de arreglar aquí.
  url.protocol = "https:";
  return { ok: true, url: url.toString() };
}

/**
 * Un enlace público cualquiera del negocio (Linktree, Beacons, su propia web).
 *
 * A diferencia de Maps, aquí NO hay lista blanca de dominios: es el enlace del
 * propio dueño y puede apuntar a cualquier servicio. Lo que sí se exige es el
 * protocolo —`http`/`https` y nada más—, porque esto acaba en un `href` de una
 * página pública y `javascript:` es una URL perfectamente válida para `new URL`.
 */
export function normalizePublicUrl(
  entrada: string | null | undefined,
): ResultadoEnlace {
  const texto = (entrada ?? "").trim();
  if (!texto) return { ok: true, url: undefined };

  const candidato = extraerUrl(texto) ?? texto;
  let url: URL;
  try {
    url = new URL(
      /^https?:\/\//i.test(candidato) ? candidato : `https://${candidato}`,
    );
  } catch {
    return { ok: false, error: "Eso no parece un enlace. Pega la dirección completa." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, error: "El enlace debe empezar por https://" };
  }
  // Sin punto en el nombre no es un dominio: `https://algo` pasa el `new URL`
  // pero no lleva a ninguna parte.
  if (!url.hostname.includes(".")) {
    return { ok: false, error: "Falta el dominio. Ejemplo: https://linktr.ee/tunegocio" };
  }
  url.protocol = "https:";
  return { ok: true, url: url.toString() };
}

/** Un usuario de Instagram: letras, números, punto y guion bajo. Máx. 30. */
const USUARIO_INSTAGRAM = /^[A-Za-z0-9._]{1,30}$/;

/** Rutas de Instagram que no son un perfil. */
const RUTAS_RESERVADAS = new Set(["p", "reel", "reels", "stories", "explore", "tv"]);

/**
 * Perfil de Instagram normalizado a `https://www.instagram.com/<usuario>`.
 *
 * Acepta `@dermaland`, `dermaland`, `instagram.com/dermaland` y la URL
 * completa con los parámetros de seguimiento que añade la app —que se
 * descartan: no tiene sentido publicar el identificador de sesión de quien
 * copió el enlace.
 */
export function normalizeInstagram(entrada: string | null | undefined): ResultadoEnlace {
  const texto = (entrada ?? "").trim();
  if (!texto) return { ok: true, url: undefined };

  let usuario = texto;

  if (/instagram\.com/i.test(texto)) {
    const candidato = extraerUrl(texto) ?? texto;
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(candidato) ? candidato : `https://${candidato}`);
    } catch {
      return { ok: false, error: "No pudimos leer ese enlace de Instagram." };
    }
    const host = url.hostname.toLowerCase();
    if (host !== "instagram.com" && host !== "www.instagram.com") {
      return { ok: false, error: "El enlace debe ser de instagram.com" };
    }
    usuario = url.pathname.split("/").filter(Boolean)[0] ?? "";
    if (RUTAS_RESERVADAS.has(usuario.toLowerCase())) {
      return {
        ok: false,
        error: "Ese es el enlace de una publicación, no del perfil. Abre el perfil y copia su enlace.",
      };
    }
  }

  usuario = usuario.replace(/^@/, "").trim();

  if (!USUARIO_INSTAGRAM.test(usuario)) {
    return {
      ok: false,
      error: "Escribe el usuario de Instagram (por ejemplo @dermaland) o pega el enlace de su perfil.",
    };
  }

  return { ok: true, url: `https://www.instagram.com/${usuario}` };
}

/** El `@usuario` a mostrar, derivado de la URL guardada. */
export function instagramHandle(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const usuario = new URL(url).pathname.split("/").filter(Boolean)[0];
    return usuario ? `@${usuario}` : undefined;
  } catch {
    return undefined;
  }
}
