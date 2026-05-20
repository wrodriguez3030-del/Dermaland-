import "server-only";
import type { CustomerRepository, RepoContext } from "../types";
import type { Customer, CustomerNote } from "@/types";
import { SupabaseRepositoryError, getClient } from "./client";
import { clientRowToTs } from "./mappers";

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

export const customerRepository: CustomerRepository = {
  async list(ctx: RepoContext, opts) {
    const sb = await getClient("customer.list");
    let q = sb
      .from("clients")
      .select("*")
      .eq("business_id", ctx.businessId)
      .is("deleted_at", null);

    if (opts?.tag) q = q.contains("tags", [opts.tag]);

    if (opts?.search) {
      const term = opts.search.replace(/[%,]/g, "");
      q = q.or(
        `first_name.ilike.%${term}%,last_name.ilike.%${term}%,document_number.ilike.%${term}%,phone.ilike.%${term}%`,
      );
    }

    q = q.order("first_name", { ascending: true });
    const { data, error } = await q;
    if (error) throw new SupabaseRepositoryError("customer.list", error);
    return (data ?? []).map(clientRowToTs);
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
      phone: customer.phone ?? null,
      whatsapp: customer.whatsapp ?? null,
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
};
