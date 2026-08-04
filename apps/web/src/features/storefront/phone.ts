// El teléfono del cliente, normalizado a diez dígitos.
//
// Existe por un fallo real en producción: la máscara del sistema
// (`formatDominicanPhone`) produce "+1 809-555-1234" cuando el cliente escribe
// el código de país, eso son ONCE dígitos, y la validación del pedido exigía
// exactamente diez. El pedido se rechazaba, React 19 vaciaba el formulario al
// terminar la acción, y el cliente se quedaba mirando una pantalla en blanco sin
// saber qué había hecho mal.
//
// La regla es la misma que usa el ERP: diez dígitos locales, y un "1" delante se
// entiende como código de país y se descarta.
//
// Un solo sitio para esto, usado por el alta de pedido, el registro y la
// interfaz: si cada uno llevara su propia idea de qué es un teléfono válido,
// volveríamos a tener un formulario que acepta lo que el servidor rechaza.

const LARGO_LOCAL = 10;

/** Diez dígitos limpios, o `null` si no hay un teléfono marcable. */
export function toLocalPhoneDigits(raw: string | null | undefined): string | null {
  const digitos = (raw ?? "").replace(/\D/g, "");

  if (digitos.length === LARGO_LOCAL) return digitos;

  // "1" delante = código de país de República Dominicana. Se descarta.
  if (digitos.length === LARGO_LOCAL + 1 && digitos.startsWith("1")) {
    return digitos.slice(1);
  }

  return null;
}
