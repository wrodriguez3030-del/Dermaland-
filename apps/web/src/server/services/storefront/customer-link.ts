import "server-only";
import { splitFullName } from "@/features/storefront/account/full-name";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Meter a un cliente de la tienda en la base de clientes del ERP.
 *
 * Lo usan los DOS caminos —crear cuenta y hacer un pedido— a propósito: si cada
 * uno llevara su propia idea de cuándo un cliente "ya existe", el mismo señor
 * acabaría con dos fichas según por dónde entrara.
 *
 * Buscar antes de crear no es cortesía: una ficha duplicada parte el historial
 * de compras en dos, y el día que alguien mire cuánto ha gastado ese cliente
 * verá la mitad.
 */

type Admin = NonNullable<ReturnType<typeof createServiceRoleClient>>;

/**
 * `clients.source` tiene un CHECK que solo admite
 * `manual|whatsapp|web|import|agendapro`. Un valor nuevo revienta el alta.
 */
const FUENTE_WEB = "web";

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

/**
 * ¿Esta persona ya tiene ficha?
 *
 * Consultas separadas con `.eq()` y NO un `.or()` con la cadena montada a mano:
 * concatenar en un filtro texto que escribió un desconocido es la misma familia
 * de fallo que el SQL sin parametrizar — una coma dentro del valor abre una
 * condición nueva. `.eq()` va parametrizado y no hay nada que escapar.
 */
async function buscarExistente(
  admin: Admin,
  businessId: string,
  datos: CustomerIdentity,
): Promise<string | undefined> {
  const busquedas: Array<["email" | "phone" | "whatsapp", string | undefined]> = [
    // El teléfono primero: en esta tienda es obligatorio y el correo no.
    ["phone", datos.phone],
    ["whatsapp", datos.phone],
    ["email", datos.email],
  ];
  for (const [columna, valor] of busquedas) {
    if (!valor) continue;
    const { data } = await admin
      .from("clients")
      .select("id")
      .eq("business_id", businessId)
      .eq(columna, valor)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  return undefined;
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

  const existente = await buscarExistente(admin, businessId, datos);
  if (existente) return existente;

  const { firstName, lastName } = splitFullName(datos.fullName);

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
        phone: datos.phone,
        whatsapp: datos.phone,
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
