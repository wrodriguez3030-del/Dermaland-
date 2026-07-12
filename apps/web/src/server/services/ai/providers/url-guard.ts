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
  if (isPrivateIPv4(host)) {
    return "La URL base no puede apuntar a una IP privada o de loopback.";
  }
  // IPv6 loopback / link-local / unique-local.
  if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) {
    return "La URL base no puede apuntar a una dirección IPv6 interna.";
  }
  return null;
}
