import type { Customer } from "@/types";
import {
  normalizeDocument,
  normalizeEmail,
  normalizePhone,
} from "./customer-normalization";

/**
 * Búsqueda de clientes por nombre, documento, teléfono o correo.
 *
 * El buscador de la pantalla de Clientes existía pero no estaba conectado a
 * nada: un `<input>` sin valor ni manejador. Con 6 524 clientes eso deja la
 * lista inservible — encontrar a alguien exigía pasar páginas a mano.
 *
 * Las reglas de normalización NO se reinventan aquí: se reutilizan las
 * canónicas de `customer-normalization`, las mismas que usan el emparejamiento
 * venta↔cliente y la detección de duplicados. Si la búsqueda normalizara un
 * teléfono distinto a como lo normaliza el emparejamiento, encontrarías un
 * cliente que el sistema considera otro.
 */

/** Minúsculas y sin tildes, para que «Muñoz» aparezca buscando «munoz». */
export function normalizarTexto(valor: string | null | undefined): string {
  if (!valor) return "";
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * ¿Este cliente cumple la búsqueda?
 *
 * El nombre se busca por PALABRAS y en cualquier orden: «mejia laura» encuentra
 * a Laura Mejía, porque nadie recuerda si tecleó primero el nombre o el
 * apellido. Cada palabra tiene que aparecer en algún sitio; así «laura 829»
 * acota de verdad en vez de ampliar.
 *
 * Documento y teléfono se comparan NORMALIZADOS en los dos lados: buscar
 * «031-0327428-2» encuentra al que está guardado como «03103274282», y
 * «829 714 1975» al que tiene «+1 (829) 714-1975».
 */
/**
 * Acepta lo MÍNIMO que necesita para buscar, no un `Customer` entero: así el
 * listado puede mandar al navegador solo los campos que usa (ver
 * `ClienteDeListado`) sin que esta función lo impida. Un `Customer` completo
 * sigue valiendo.
 */
type ClienteBuscable = Pick<
  Customer,
  "firstName" | "lastName" | "customerNumber" | "email" | "documentNumber" | "phone" | "whatsapp"
>;

export function coincideCliente(cliente: ClienteBuscable, consulta: string): boolean {
  const q = normalizarTexto(consulta);
  if (!q) return true;

  const nombre = normalizarTexto(`${cliente.firstName ?? ""} ${cliente.lastName ?? ""}`);
  const numero = normalizarTexto(cliente.customerNumber);
  const correo = normalizeEmail(cliente.email);
  const doc = normalizeDocument(cliente.documentNumber);
  const tel = normalizePhone(cliente.phone);
  const wa = normalizePhone(cliente.whatsapp);

  // Si lo tecleado tiene dígitos, se prueba también como documento/teléfono.
  const qDoc = normalizeDocument(consulta);
  const qTel = normalizePhone(consulta);

  return q.split(" ").every((palabra) => {
    if (nombre.includes(palabra)) return true;
    if (numero.includes(palabra)) return true;
    if (correo.includes(palabra)) return true;
    // Los identificadores se comparan enteros contra la parte normalizada de la
    // consulta, no palabra a palabra: un teléfono escrito con espacios se parte
    // en trozos que por separado no significan nada.
    if (qDoc && doc && doc.includes(qDoc)) return true;
    if (qTel && (tel.includes(qTel) || wa.includes(qTel))) return true;
    return false;
  });
}

/** Fuentes tal como las guarda `Customer.source`, con su etiqueta en pantalla. */
export const FUENTES: { valor: Customer["source"]; etiqueta: string }[] = [
  { valor: "manual", etiqueta: "Manual" },
  { valor: "whatsapp", etiqueta: "WhatsApp" },
  { valor: "web", etiqueta: "Web" },
  { valor: "import", etiqueta: "Importación" },
  { valor: "agendapro", etiqueta: "AgendaPro" },
  { valor: "alegra", etiqueta: "Migrado de Alegra" },
];
