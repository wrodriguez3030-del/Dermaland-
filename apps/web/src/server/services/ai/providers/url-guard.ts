import "server-only";

/**
 * SEC-014: valida el `base_url` de un proveedor "compatible con OpenAI" para
 * evitar SSRF. El servidor hace fetch a esa URL (con la API key), así que un
 * admin no debe poder apuntarla a servicios internos (metadata de la nube,
 * localhost, IPs privadas). Función pura y testeable.
 *
 * Nota: bloquea literales de IP privada y hostnames obvios (localhost, .local,
 * metadata). No resuelve DNS (mitigación de rebinding queda para el fetch);
 * cubre el 99% del abuso realista desde la UI.
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
]);

function isPrivateIPv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 169 && b === 254) return true; // link-local (metadata 169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  return false;
}

/**
 * DL-06: canonicaliza un hostname a IPv4 punteada cuando representa una IPv4 en
 * forma NO punteada (decimal `2852039166`, octal `0250.0376...`, hex `0xA9FEA9FE`)
 * o IPv4-mapped IPv6 (`::ffff:a9fe:a9fe`). Antes, `isPrivateIPv4` solo miraba la
 * forma punteada y estas codificaciones saltaban el guard SSRF. Devuelve null si
 * el host no es una IPv4 reconocible.
 */
function toDottedIPv4(host: string): string | null {
  const fromInt = (n: number): string | null =>
    Number.isFinite(n) && n >= 0 && n <= 0xffffffff
      ? `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`
      : null;

  // IPv4-mapped IPv6: ::ffff:a.b.c.d  o  ::ffff:aabb:ccdd
  const mapped = host.match(/^::ffff:(.+)$/i);
  if (mapped) {
    const inner = mapped[1]!;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(inner)) return inner;
    const hx = inner.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    // `>>> 0`: el OR bit a bit da int32 con signo (negativo para 128.x+); lo pasamos a uint32.
    if (hx) return fromInt(((parseInt(hx[1]!, 16) << 16) | parseInt(hx[2]!, 16)) >>> 0);
  }

  // IPv4 empaquetada en un solo número: hex, octal o decimal.
  if (/^0x[0-9a-f]+$/i.test(host)) return fromInt(parseInt(host, 16));
  if (/^0[0-7]+$/.test(host)) return fromInt(parseInt(host, 8));
  if (/^\d+$/.test(host)) return fromInt(parseInt(host, 10));

  // Octetos punteados en octal/hex/decimal mezclados (p. ej. 0250.0376.0251.0376).
  const parts = host.split(".");
  if (parts.length === 4 && parts.every((p) => /^(0x[0-9a-f]+|0[0-7]*|\d+)$/i.test(p))) {
    const octs = parts.map((p) =>
      /^0x/i.test(p) ? parseInt(p, 16) : /^0[0-7]+$/.test(p) ? parseInt(p, 8) : parseInt(p, 10),
    );
    if (octs.every((o) => Number.isFinite(o) && o >= 0 && o <= 255)) return octs.join(".");
  }
  return null;
}

/** Devuelve un mensaje de error si la URL NO es segura, o null si es válida. */
export function validateProviderBaseUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "La URL base no es válida.";
  }
  if (url.protocol !== "https:") {
    return "La URL base debe usar https.";
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".local") || host.endsWith(".internal")) {
    return "La URL base no puede apuntar a un host interno.";
  }
  // DL-06: canonicalizar codificaciones de IPv4 (decimal/octal/hex/IPv4-mapped)
  // antes de comprobar rango privado, para que no salten el guard.
  const canonical = toDottedIPv4(host) ?? host;
  if (isPrivateIPv4(canonical)) {
    return "La URL base no puede apuntar a una IP privada o de loopback.";
  }
  // IPv6 loopback / link-local / unique-local.
  if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) {
    return "La URL base no puede apuntar a una dirección IPv6 interna.";
  }
  return null;
}
