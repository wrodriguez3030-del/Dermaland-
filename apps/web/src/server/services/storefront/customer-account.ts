import "server-only";
import { parseRegistration } from "@/features/storefront/account/registration";
import { createServer, createServiceRoleClient } from "@/lib/supabase/server";
import { resolveStorefrontTenant } from "./tenant";

/**
 * Alta y lectura de la cuenta web de un cliente.
 *
 * Lo que hace que esto NO abra el ERP: el usuario se crea con `app_metadata`
 * VACÍO. Sin `business_id`, el portero del middleware lo devuelve a `/tienda`
 * antes de servirle una sola página interna. Aquí no se escribe `app_metadata`
 * en ningún momento; si alguien añadiera esa línea en el futuro, ESA sería la
 * brecha, no el formulario.
 *
 * El vínculo con la ficha comercial va a `client_auth_links` con service-role,
 * no al token: que el cliente pudiera insertar ahí sería dejarle elegir a qué
 * historial de compras se engancha.
 */

type Admin = NonNullable<ReturnType<typeof createServiceRoleClient>>;

export interface CustomerAccount {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

export interface SignUpResult {
  ok: boolean;
  error?: string;
  /** Supabase exige confirmar el correo antes de dar sesión. */
  needsConfirmation?: boolean;
}

/**
 * `clients.source` tiene un CHECK que sólo admite
 * `manual|whatsapp|web|import|agendapro`. Un valor nuevo reventaría el alta.
 */
const FUENTE_WEB = "web";

/** Mismo formato que genera el ERP en `repositories/supabase/customer.ts`. */
function generarNumeroCliente(): string {
  return `CLI-${Math.floor(100000 + Math.random() * 900000)}`;
}

/**
 * ¿Esta persona ya tiene ficha en el mostrador?
 *
 * Consultas separadas con `.eq()` y NO un `.or()` con la cadena montada a mano:
 * `.or("email.eq." + email)` sería construir un filtro concatenando texto que
 * escribió un desconocido —una coma dentro del valor abre una condición nueva—.
 * `.eq()` va parametrizado y no hay nada que escapar.
 */
async function buscarClienteExistente(
  admin: Admin,
  businessId: string,
  datos: { email: string; phone: string },
): Promise<string | undefined> {
  const busquedas: Array<["email" | "phone" | "whatsapp", string]> = [
    ["email", datos.email],
    ["phone", datos.phone],
    ["whatsapp", datos.phone],
  ];
  for (const [columna, valor] of busquedas) {
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

/** Crea la ficha comercial. `customer_number` es obligatorio y sin default. */
async function crearCliente(
  admin: Admin,
  businessId: string,
  datos: { firstName: string; lastName: string; email: string; phone: string },
): Promise<string | undefined> {
  // Hasta tres intentos: el número es aleatorio de 6 dígitos y puede chocar.
  for (let intento = 0; intento < 3; intento++) {
    const { data, error } = await admin
      .from("clients")
      .insert({
        business_id: businessId,
        customer_number: generarNumeroCliente(),
        first_name: datos.firstName,
        last_name: datos.lastName,
        email: datos.email,
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

export async function signUpCustomer(raw: unknown): Promise<SignUpResult> {
  const parsed = parseRegistration(raw);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const tenant = await resolveStorefrontTenant();
  // Sin tienda encendida no hay a qué negocio enganchar la cuenta. Fail-closed.
  if (!tenant) return { ok: false, error: "La tienda no está disponible." };

  const sb = await createServer();
  const admin = createServiceRoleClient();
  if (!sb || !admin) return { ok: false, error: "Cuentas no disponibles." };

  const { email, password, firstName, lastName, phone } = parsed.value;

  // `signUp` NO recibe `app_metadata`: no se puede escribir desde el cliente, y
  // aquí tampoco se escribe desde el servidor. El cliente web nace sin claims.
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error || !data.user?.id) {
    // El mensaje de Supabase viene en inglés y a veces delata si el correo ya
    // existe. Se responde siempre lo mismo para no convertir el formulario en un
    // comprobador de qué correos están registrados.
    return {
      ok: false,
      error:
        "No pudimos crear la cuenta. Revisa el correo e inténtalo de nuevo.",
    };
  }
  const authUserId = data.user.id;

  // ¿Ya compraba en el mostrador? Se reutiliza su ficha en vez de duplicarla.
  const clientId =
    (await buscarClienteExistente(admin, tenant.businessId, { email, phone })) ??
    (await crearCliente(admin, tenant.businessId, {
      firstName,
      lastName,
      email,
      phone,
    }));

  if (!clientId) return { ok: false, error: "No pudimos crear la cuenta." };

  const { error: errorVinculo } = await admin
    .from("client_auth_links")
    .upsert(
      {
        auth_user_id: authUserId,
        client_id: clientId,
        business_id: tenant.businessId,
      },
      { onConflict: "auth_user_id" },
    );
  if (errorVinculo) return { ok: false, error: "No pudimos crear la cuenta." };

  // Sin sesión devuelta = Supabase está exigiendo confirmar el correo.
  return { ok: true, needsConfirmation: !data.session };
}

/**
 * La cuenta de quien está mirando, o `null`.
 *
 * Devuelve `null` también para el PERSONAL del negocio: alguien con
 * `business_id` no es un cliente de la tienda, y enseñarle "Mi cuenta" con la
 * ficha de otro sería mezclar dos identidades distintas.
 */
export async function resolveCustomerAccount(): Promise<CustomerAccount | null> {
  const sb = await createServer();
  if (!sb) return null;
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  if (user.app_metadata?.business_id) return null;

  const admin = createServiceRoleClient();
  if (!admin) return null;

  const { data: vinculo } = await admin
    .from("client_auth_links")
    .select("client_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!vinculo) return null;

  const { data: cliente } = await admin
    .from("clients")
    .select("first_name, last_name, email, phone")
    .eq("id", vinculo.client_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!cliente) return null;

  return {
    email: cliente.email ?? user.email ?? "",
    firstName: cliente.first_name,
    lastName: cliente.last_name,
    phone: cliente.phone ?? undefined,
  };
}
