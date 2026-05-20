import "server-only";
import type { BranchRepository, RepoContext } from "../types";
import type { Branch } from "@/types";
import { SupabaseRepositoryError, getClient } from "./client";
import { branchRowToTs } from "./mappers";

export const branchRepository: BranchRepository = {
  async list(ctx: RepoContext) {
    const sb = await getClient("branch.list");
    const { data, error } = await sb
      .from("branches")
      .select("*")
      .eq("business_id", ctx.businessId)
      .is("deleted_at", null)
      .order("name", { ascending: true });
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
};
