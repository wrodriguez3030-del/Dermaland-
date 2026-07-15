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

  async update(ctx: RepoContext, id: string, patch: Partial<Customer>) {
    const sb = await getClient("customer.update");
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.firstName !== undefined) row.first_name = patch.firstName;
    if (patch.lastName !== undefined) row.last_name = patch.lastName;
    if (patch.documentType !== undefined) row.document_type = patch.documentType ?? null;
    if (patch.documentNumber !== undefined) row.document_number = patch.documentNumber ?? null;
    if (patch.phone !== undefined) row.phone = patch.phone ?? null;
    if (patch.whatsapp !== undefined) row.whatsapp = patch.whatsapp ?? null;
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
