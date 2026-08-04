import "server-only";
import { splitFullName } from "@/features/storefront/account/full-name";
import {
  normalizeEmail,
  normalizePhone,
} from "@/features/customers/customer-normalization";
import {
  pickClientMatch,
  type ClientCandidate,
} from "@/features/customers/identity-match";
import { formatDominicanPhone } from "@/lib/utils/formatters";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Meter a un cliente de la tienda en la base de clientes del ERP.
 *
 * Lo usan los DOS caminos —crear cuenta y hacer un pedido— a propósito: si cada
 * uno llevara su propia idea de cuándo un cliente "ya existe", el mismo señor
 * acabaría con dos fichas según por dónde entrara.
 *
 * QUÉ SALIÓ MAL ANTES
 *
 * Se buscaba con `.eq("phone", "8297141975")` contra una base donde el mostrador
 * escribe `829-714-1975`. No casaba nunca. `CLI-420678` y `CLI-573912` son la
 * misma persona: el duplicado ya está creado, no es un riesgo teórico.
 *
 * Ahora la comparación va contra las columnas normalizadas de `clients`
 * (migración 0042), que aplican en SQL la misma regla que
 * `customer-normalization.ts` aplica en TypeScript. Y quién es quién lo decide
 * `pickClientMatch`, que además del número exige que el nombre encaje — porque
 * en esta base hay dos personas distintas compartiendo la línea de casa.
 */

type Admin = NonNullable<ReturnType<typeof createServiceRoleClient>>;

/**
 * `clients.source` tiene un CHECK que solo admite
 * `manual|whatsapp|web|import|agendapro`. Un valor nuevo revienta el alta.
 */
const FUENTE_WEB = "web";

/** Columnas justas para decidir identidad. Ni una de más. */
const COLUMNAS_CANDIDATA =
  "id, first_name, last_name, phone_digits, whatsapp_digits, email_normalized, created_at";

/** Mismo formato que genera el ERP en `repositories/supabase/customer.ts`. */
function generarNumeroCliente(): string {
  return `CLI-${Math.floor(100000 + Math.random() * 900000)}`;
}

export interface CustomerIdentity {
  /** Como lo escribió en una sola casilla: "Ana Pérez". */
  fullName: string;
  /** Solo dígitos. Es la llave más fiable: el correo es opcional. */
  phone: string;
  email?: string;
}

type FilaCandidata = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone_digits: string | null;
  whatsapp_digits: string | null;
  email_normalized: string | null;
  created_at: string;
};

function aCandidata(f: FilaCandidata): ClientCandidate {
  return {
    id: f.id,
    firstName: f.first_name,
    lastName: f.last_name,
    phoneDigits: f.phone_digits,
    whatsappDigits: f.whatsapp_digits,
    emailNormalized: f.email_normalized,
    createdAt: f.created_at,
  };
}

/**
 * Fichas que comparten teléfono o correo con quien está comprando.
 *
 * Tres consultas con `.eq()` y NO un `.or()` con la cadena montada a mano:
 * concatenar en un filtro texto que escribió un desconocido es la misma familia
 * de fallo que el SQL sin parametrizar — una coma dentro del valor abre una
 * condición nueva. `.eq()` va parametrizado y no hay nada que escapar.
 *
 * Las tres columnas están indexadas por `(business_id, …)` con el mismo
 * `WHERE deleted_at IS NULL` de la consulta, así que esto no barre la tabla por
 * muchos clientes que haya.
 */
async function buscarCandidatas(
  admin: Admin,
  businessId: string,
  datos: CustomerIdentity,
): Promise<ClientCandidate[]> {
  const telefono = normalizePhone(datos.phone);
  const correo = normalizeEmail(datos.email);

  const filtros: Array<
    ["phone_digits" | "whatsapp_digits" | "email_normalized", string]
  > = [];
  if (telefono) {
    filtros.push(["phone_digits", telefono], ["whatsapp_digits", telefono]);
  }
  if (correo) filtros.push(["email_normalized", correo]);
  if (filtros.length === 0) return [];

  const resultados = await Promise.all(
    filtros.map(([columna, valor]) =>
      admin
        .from("clients")
        .select(COLUMNAS_CANDIDATA)
        .eq("business_id", businessId)
        .eq(columna, valor)
        .is("deleted_at", null)
        .limit(20),
    ),
  );

  // Sin repetir: la misma ficha puede salir por teléfono Y por correo.
  const porId = new Map<string, ClientCandidate>();
  for (const { data } of resultados) {
    for (const fila of (data ?? []) as FilaCandidata[]) {
      porId.set(fila.id, aCandidata(fila));
    }
  }
  return [...porId.values()];
}

/**
 * Busca la ficha del cliente y, si no existe, la crea.
 *
 * Devuelve `undefined` solo si no se pudo crear. El llamador decide si eso
 * detiene la operación: en un pedido **no** debe detenerla —perder una venta
 * porque falló el alta de la ficha sería absurdo—, y en un registro sí.
 */
export async function findOrCreateClient(
  businessId: string,
  datos: CustomerIdentity,
): Promise<string | undefined> {
  const admin = createServiceRoleClient();
  if (!admin) return undefined;

  const candidatas = await buscarCandidatas(admin, businessId, datos);
  const encontrada = pickClientMatch(candidatas, {
    fullName: datos.fullName,
    phone: datos.phone,
    email: datos.email,
  });
  if (encontrada) return encontrada.id;

  const { firstName, lastName } = splitFullName(datos.fullName);

  // El teléfono se guarda CON GUIONES, como lo escribe el mostrador. La ficha
  // que nace en la tienda tiene que leerse igual que las demás; para buscar ya
  // están las columnas normalizadas, que salen solas.
  const telefono = formatDominicanPhone(datos.phone);

  // Hasta tres intentos: `customer_number` es aleatorio de 6 dígitos, es NOT
  // NULL y no tiene valor por defecto, así que puede chocar.
  for (let intento = 0; intento < 3; intento++) {
    const { data, error } = await admin
      .from("clients")
      .insert({
        business_id: businessId,
        customer_number: generarNumeroCliente(),
        first_name: firstName,
        last_name: lastName,
        email: datos.email ?? null,
        phone: telefono,
        whatsapp: telefono,
        source: FUENTE_WEB,
      })
      .select("id")
      .single();
    if (data?.id) return data.id;
    // 23505 = clave duplicada. Cualquier otro error no se arregla reintentando.
    if (error?.code !== "23505") return undefined;
  }
  return undefined;
}
