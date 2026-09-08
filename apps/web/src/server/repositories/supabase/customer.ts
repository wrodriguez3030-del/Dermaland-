import "server-only";
import type { CustomerRepository, RepoContext } from "../types";
import type { Customer, CustomerNote } from "@/types";
import { SupabaseRepositoryError, getClient } from "./client";
import { clientRowToTs } from "./mappers";
import { fetchAllPages } from "@/server/repositories/supabase/pagination";
import type { Database } from "@/server/db/database.types";
import { formatDominicanPhone } from "@/lib/utils/formatters";

/**
 * Genera un `customer_number` simple: `CLI-XXXXXX` (6 dígitos aleatorios).
 * Pueden existir colisiones — el caller debería reintentar si la inserción
 * falla con violación de unique constraint. En la práctica, 1M de espacio
 * y volumen modesto hace que colisiones sean raras en el corto plazo.
 */
function generateCustomerNumber(): string {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `CLI-${n}`;
}

/**
 * El teléfono, siempre igual: `AAA-BBB-CCCC`.
 *
 * Devuelve `null` para lo vacío —no una cadena vacía— porque `""` y "no tiene
 * teléfono" son la misma cosa y guardarlos distinto obliga a distinguirlos
 * después. Lo que no parezca un teléfono se guarda tal cual: un número
 * extranjero o una extensión son datos reales, y perderlos por no encajar en un
 * formato dominicano sería peor que el formato desparejo.
 */
function telefonoUniforme(valor: string | null | undefined): string | null {
  const bruto = (valor ?? "").trim();
  if (!bruto) return null;
  const formateado = formatDominicanPhone(bruto);
  return formateado || bruto;
}

/**
 * Tope duro de `customer.list`: por más que pida el caller en `opts.limit`,
 * nunca se devuelven más filas que esto.
 *
 * Medido el 06/09/2026: DermaLand tiene 6 525 clientes. `/api/customers` es
 * la fuente de `useCustomers()`, y de ahí salen dos pantallas que buscan
 * sobre la lista COMPLETA en el navegador (no tienen búsqueda propia contra
 * el servidor): el selector de cliente del POS (`CustomerSearchSelect`, vía
 * `pos-terminal.tsx`) y la ficha de edición de cliente (`useCustomer(id)`
 * busca por id dentro de la misma lista). Si el tope queda por debajo del
 * padrón real, el cajero deja de encontrar clientes que sí existen — peor
 * que la lentitud que se está arreglando. 10 000 da ~53% de margen sobre el
 * conteo de hoy (similar orden de magnitud al tope de 25k ya usado en
 * `/api/customers/check-duplicate` para un barrido completo del negocio).
 */
const TOPE_CLIENTES = 10_000;

export const customerRepository: CustomerRepository = {
  async list(ctx: RepoContext, opts) {
    const sb = await getClient("customer.list");
    let q = sb
      .from("clients")
      // 🔴 Las columnas que el LISTADO usa, no `*`. Con `*`, los 6 525 clientes
      // pesaban 4,9 MB de JSON y abrir «Clientes» era esperar; con estas trece
      // son 1,9 MB (61% menos), medido contra la base real el 07/09/2026.
      //
      // Las trece las fijó el compilador al estrechar `CustomerMetricsRow`, no
      // una lectura a ojo: quitar una de más habría roto la pantalla en el sitio
      // exacto, y eso es justo lo que se quiere de un recorte así.
      //
      // `byId` sigue trayendo `*`: la FICHA sí necesita el cliente entero, y es
      // una sola fila.
      .select(
        "id,business_id,customer_number,first_name,last_name,document_type,document_number," +
          "phone,whatsapp,email,source,tags,skin_type,created_at,updated_at",
      )
      .eq("business_id", ctx.businessId)
      .is("deleted_at", null);

    if (opts?.tag) q = q.contains("tags", [opts.tag]);

    if (opts?.search) {
      const term = opts.search.replace(/[%,]/g, "");
      // El teléfono se guarda con guiones ("829-714-1975"), así que buscar
      // "8297141975" no encontraba a nadie — y quien no encuentra a un cliente
      // lo vuelve a crear. Las columnas normalizadas (migración 0042) son solo
      // dígitos; el término se reduce igual para que las dos formas casen.
      // Son dígitos por construcción: no hay nada que escapar en el filtro.
      const digitos = opts.search.replace(/\D/g, "");
      const clausulas = [
        `first_name.ilike.%${term}%`,
        `last_name.ilike.%${term}%`,
        `document_number.ilike.%${term}%`,
        `phone.ilike.%${term}%`,
      ];
      if (digitos.length >= 3) {
        clausulas.push(
          `phone_digits.ilike.%${digitos}%`,
          `whatsapp_digits.ilike.%${digitos}%`,
        );
      }
      q = q.or(clausulas.join(","));
    }

    // Orden total y estable: `first_name` se repite (hay varias «Ana»), y sin
    // el desempate por `id` dos páginas podrían repetir una fila y perder otra.
    q = q.order("first_name", { ascending: true }).order("id", { ascending: true });

    // 🔴 Sin `.range()`, PostgREST devuelve 1 000 filas EN SILENCIO. Con 6 525
    // clientes eso dejaba 5 525 fuera: el buscador de la pantalla no encontraba
    // a «CIBAO SPA LASER CSL SRL» porque ese cliente NUNCA llegaba al navegador,
    // y quien no encuentra a un cliente lo vuelve a crear duplicado.
    //
    // El tope sigue siendo `TOPE_CLIENTES`: se pagina hasta él, no sin freno.
    const limite = Math.min(opts?.limit ?? TOPE_CLIENTES, TOPE_CLIENTES);
    const filas = await fetchAllPages<Database["public"]["Tables"]["clients"]["Row"]>(
      async (from, to) => {
        // La última página se recorta al tope: pedir de más traería filas que
        // habría que tirar.
        if (from >= limite) return [];
        const { data, error } = await q.range(from, Math.min(to, limite - 1));
        if (error) throw new SupabaseRepositoryError("customer.list", error);
        return data ?? [];
      },
    );
    return filas.map(clientRowToTs);
  },

  async byId(ctx: RepoContext, id: string) {
    const sb = await getClient("customer.byId");
    const { data, error } = await sb
      .from("clients")
      .select("*")
      .eq("business_id", ctx.businessId)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new SupabaseRepositoryError("customer.byId", error);
    return data ? clientRowToTs(data) : null;
  },

  async notes(_ctx: RepoContext, _customerId: string): Promise<CustomerNote[]> {
    // La tabla `customer_notes` no existe aún en el esquema 0001-0004 (las
    // notas viven en `clients.notes` como texto plano). Devolvemos [] hasta
    // que la tabla se cree en una migración posterior.
    return [];
  },

  async create(
    ctx: RepoContext,
    customer: Omit<Customer, "id" | "createdAt" | "updatedAt">,
  ) {
    const sb = await getClient("customer.create");
    const customerNumber =
      customer.customerNumber && customer.customerNumber.trim().length > 0
        ? customer.customerNumber
        : generateCustomerNumber();

    const row = {
      business_id: ctx.businessId,
      customer_number: customerNumber,
      first_name: customer.firstName,
      last_name: customer.lastName,
      document_type: customer.documentType ?? null,
      document_number: customer.documentNumber ?? null,
      // Un solo formato para todos: el mostrador escribía "829-714-1975" y la
      // tienda "8297141975", y la lista de clientes acababa pareciendo dos
      // sistemas distintos. Se normaliza AQUÍ, en la única puerta por la que
      // pasa todo lo que se guarda; para buscar están las columnas generadas.
      phone: telefonoUniforme(customer.phone),
      whatsapp: telefonoUniforme(customer.whatsapp),
      email: customer.email ?? null,
      birth_date: customer.birthDate ?? null,
      address: customer.address ?? null,
      city: customer.city ?? null,
      province: customer.province ?? null,
      source: customer.source,
      tags: customer.tags ?? [],
      default_billing_type: customer.defaultBillingType,
      skin_type: customer.skinType,
      total_spent: customer.totalSpent ?? 0,
      total_orders: customer.totalOrders ?? 0,
      last_visit_at: customer.lastVisitAt ?? null,
      notes: customer.notes ?? null,
      consents: customer.consents ?? [],
    };

    const { data, error } = await sb
      .from("clients")
      .insert(row)
      .select("*")
      .single();
    if (error) throw new SupabaseRepositoryError("customer.create", error);
    return clientRowToTs(data);
  },

  async update(ctx: RepoContext, id: string, patch: Partial<Customer>) {
    const sb = await getClient("customer.update");
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.firstName !== undefined) row.first_name = patch.firstName;
    if (patch.lastName !== undefined) row.last_name = patch.lastName;
    if (patch.documentType !== undefined) row.document_type = patch.documentType ?? null;
    if (patch.documentNumber !== undefined) row.document_number = patch.documentNumber ?? null;
    if (patch.phone !== undefined) row.phone = telefonoUniforme(patch.phone);
    if (patch.whatsapp !== undefined) row.whatsapp = telefonoUniforme(patch.whatsapp);
    if (patch.email !== undefined) row.email = patch.email ?? null;
    if (patch.birthDate !== undefined) row.birth_date = patch.birthDate ?? null;
    if (patch.address !== undefined) row.address = patch.address ?? null;
    if (patch.city !== undefined) row.city = patch.city ?? null;
    if (patch.province !== undefined) row.province = patch.province ?? null;
    if (patch.source !== undefined) row.source = patch.source;
    if (patch.tags !== undefined) row.tags = patch.tags ?? [];
    if (patch.defaultBillingType !== undefined) row.default_billing_type = patch.defaultBillingType;
    if (patch.skinType !== undefined) row.skin_type = patch.skinType;
    if (patch.notes !== undefined) row.notes = patch.notes ?? null;
    if (patch.consents !== undefined) row.consents = patch.consents ?? [];
    if (patch.totalSpent !== undefined) row.total_spent = patch.totalSpent;
    if (patch.totalOrders !== undefined) row.total_orders = patch.totalOrders;
    if (patch.lastVisitAt !== undefined) row.last_visit_at = patch.lastVisitAt ?? null;
    // Crédito CxC (mig 0031). El gate de rol vive en la API route.
    if (patch.creditLimit !== undefined) row.credit_limit = patch.creditLimit ?? null;
    if (patch.creditDays !== undefined) row.credit_days = patch.creditDays ?? null;
    if (patch.creditBlocked !== undefined) row.credit_blocked = !!patch.creditBlocked;
    const { data, error } = await sb
      .from("clients")
      .update(row)
      .eq("business_id", ctx.businessId)
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .single();
    if (error) throw new SupabaseRepositoryError("customer.update", error);
    return clientRowToTs(data);
  },

  async softDelete(ctx: RepoContext, id: string) {
    const sb = await getClient("customer.softDelete");
    const { error } = await sb
      .from("clients")
      .update({ deleted_at: new Date().toISOString() })
      .eq("business_id", ctx.businessId)
      .eq("id", id);
    if (error) throw new SupabaseRepositoryError("customer.softDelete", error);
  },
};
