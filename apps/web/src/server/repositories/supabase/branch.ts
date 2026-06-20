import "server-only";
import type { BranchListOptions, BranchRepository, RepoContext } from "../types";
import type { Branch } from "@/types";
import { SupabaseRepositoryError, getClient } from "./client";
import { branchRowToTs } from "./mappers";

export const branchRepository: BranchRepository = {
  async list(ctx: RepoContext, opts?: BranchListOptions) {
    const sb = await getClient("branch.list");
    let query = sb
      .from("branches")
      .select("*")
      .eq("business_id", ctx.businessId)
      .is("deleted_at", null);
    if (opts?.activeOnly) query = query.eq("status", "active");
    const { data, error } = await query.order("name", { ascending: true });
    if (error) throw new SupabaseRepositoryError("branch.list", error);
    return (data ?? []).map(branchRowToTs);
  },

  async byId(ctx: RepoContext, id: string) {
    const sb = await getClient("branch.byId");
    const { data, error } = await sb
      .from("branches")
      .select("*")
      .eq("business_id", ctx.businessId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new SupabaseRepositoryError("branch.byId", error);
    return data ? branchRowToTs(data) : null;
  },

  async create(
    ctx: RepoContext,
    branch: Omit<Branch, "id" | "createdAt" | "updatedAt">,
  ) {
    const sb = await getClient("branch.create");
    const row: Record<string, unknown> = {
      business_id: ctx.businessId,
      code: branch.code,
      name: branch.name,
      address: branch.address,
      city: branch.city,
      province: branch.province,
      country: branch.country,
      phone: branch.phone ?? null,
      whatsapp: branch.whatsapp ?? null,
      email: branch.email ?? null,
      is_pilot: branch.isPilot,
      show_on_website: branch.showOnWebsite,
      status: branch.status,
    };
    const { data, error } = await sb
      .from("branches")
      .insert(row)
      .select("*")
      .single();
    if (error) throw new SupabaseRepositoryError("branch.create", error);
    return branchRowToTs(data);
  },

  async update(ctx: RepoContext, id: string, patch: Partial<Branch>) {
    const sb = await getClient("branch.update");
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.code !== undefined) row.code = patch.code;
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.address !== undefined) row.address = patch.address;
    if (patch.city !== undefined) row.city = patch.city;
    if (patch.province !== undefined) row.province = patch.province;
    if (patch.country !== undefined) row.country = patch.country;
    if (patch.phone !== undefined) row.phone = patch.phone ?? null;
    if (patch.whatsapp !== undefined) row.whatsapp = patch.whatsapp ?? null;
    if (patch.email !== undefined) row.email = patch.email ?? null;
    if (patch.isPilot !== undefined) row.is_pilot = patch.isPilot;
    if (patch.showOnWebsite !== undefined) row.show_on_website = patch.showOnWebsite;
    if (patch.status !== undefined) row.status = patch.status;
    const { data, error } = await sb
      .from("branches")
      .update(row)
      .eq("business_id", ctx.businessId)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new SupabaseRepositoryError("branch.update", error);
    return branchRowToTs(data);
  },

  async softDelete(ctx: RepoContext, id: string) {
    const sb = await getClient("branch.softDelete");
    const { error } = await sb
      .from("branches")
      .update({ deleted_at: new Date().toISOString() })
      .eq("business_id", ctx.businessId)
      .eq("id", id);
    if (error) throw new SupabaseRepositoryError("branch.softDelete", error);
  },
};
