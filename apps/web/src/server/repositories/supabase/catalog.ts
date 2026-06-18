import "server-only";
import type {
  BrandRepository,
  CategoryRepository,
  LaboratoryRepository,
  RepoContext,
} from "../types";
import { SupabaseRepositoryError, getClient } from "./client";
import { brandRowToTs, categoryRowToTs, laboratoryRowToTs } from "./mappers";

export const brandRepository: BrandRepository = {
  async list(ctx: RepoContext) {
    const sb = await getClient("brand.list");
    const { data, error } = await sb
      .from("brands")
      .select("*")
      .eq("business_id", ctx.businessId)
      .order("name", { ascending: true });
    if (error) throw new SupabaseRepositoryError("brand.list", error);
    return (data ?? []).map(brandRowToTs);
  },

  async byId(ctx: RepoContext, id: string) {
    const sb = await getClient("brand.byId");
    const { data, error } = await sb
      .from("brands")
      .select("*")
      .eq("business_id", ctx.businessId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new SupabaseRepositoryError("brand.byId", error);
    return data ? brandRowToTs(data) : null;
  },

  async create(ctx: RepoContext, input: { name: string }) {
    const sb = await getClient("brand.create");
    const { data, error } = await sb
      .from("brands")
      .insert({ business_id: ctx.businessId, name: input.name })
      .select("*")
      .single();
    if (error) throw new SupabaseRepositoryError("brand.create", error);
    return brandRowToTs(data);
  },

  async update(ctx: RepoContext, id: string, patch: { name?: string }) {
    const sb = await getClient("brand.update");
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) row.name = patch.name;
    const { data, error } = await sb
      .from("brands").update(row)
      .eq("business_id", ctx.businessId).eq("id", id)
      .select("*").single();
    if (error) throw new SupabaseRepositoryError("brand.update", error);
    return brandRowToTs(data);
  },

  async delete(ctx: RepoContext, id: string) {
    const sb = await getClient("brand.delete");
    const { error } = await sb
      .from("brands").delete()
      .eq("business_id", ctx.businessId).eq("id", id);
    if (error) throw new SupabaseRepositoryError("brand.delete", error);
  },
};

export const categoryRepository: CategoryRepository = {
  async list(ctx: RepoContext) {
    const sb = await getClient("category.list");
    const { data, error } = await sb
      .from("product_categories")
      .select("*")
      .eq("business_id", ctx.businessId)
      .order("name", { ascending: true });
    if (error) throw new SupabaseRepositoryError("category.list", error);
    return (data ?? []).map(categoryRowToTs);
  },

  async create(ctx: RepoContext, input: { name: string; parentId?: string | null; description?: string }) {
    const sb = await getClient("category.create");
    const { data, error } = await sb
      .from("product_categories")
      .insert({
        business_id: ctx.businessId,
        name: input.name,
        parent_id: input.parentId ?? null,
        description: input.description ?? null,
      })
      .select("*").single();
    if (error) throw new SupabaseRepositoryError("category.create", error);
    return categoryRowToTs(data);
  },

  async update(ctx: RepoContext, id: string, patch: { name?: string; parentId?: string | null; description?: string }) {
    const sb = await getClient("category.update");
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.parentId !== undefined) row.parent_id = patch.parentId ?? null;
    if (patch.description !== undefined) row.description = patch.description ?? null;
    const { data, error } = await sb
      .from("product_categories").update(row)
      .eq("business_id", ctx.businessId).eq("id", id)
      .select("*").single();
    if (error) throw new SupabaseRepositoryError("category.update", error);
    return categoryRowToTs(data);
  },

  async delete(ctx: RepoContext, id: string) {
    const sb = await getClient("category.delete");
    const { error } = await sb
      .from("product_categories").delete()
      .eq("business_id", ctx.businessId).eq("id", id);
    if (error) throw new SupabaseRepositoryError("category.delete", error);
  },
};

export const laboratoryRepository: LaboratoryRepository = {
  async list(ctx: RepoContext) {
    const sb = await getClient("laboratory.list");
    const { data, error } = await sb
      .from("laboratories")
      .select("*")
      .eq("business_id", ctx.businessId)
      .order("name", { ascending: true });
    if (error) throw new SupabaseRepositoryError("laboratory.list", error);
    return (data ?? []).map(laboratoryRowToTs);
  },

  async create(ctx: RepoContext, input: { name: string; country?: string }) {
    const sb = await getClient("laboratory.create");
    const { data, error } = await sb
      .from("laboratories")
      .insert({ business_id: ctx.businessId, name: input.name, country: input.country ?? null })
      .select("*").single();
    if (error) throw new SupabaseRepositoryError("laboratory.create", error);
    return laboratoryRowToTs(data);
  },

  async update(ctx: RepoContext, id: string, patch: { name?: string; country?: string }) {
    const sb = await getClient("laboratory.update");
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.country !== undefined) row.country = patch.country ?? null;
    const { data, error } = await sb
      .from("laboratories").update(row)
      .eq("business_id", ctx.businessId).eq("id", id)
      .select("*").single();
    if (error) throw new SupabaseRepositoryError("laboratory.update", error);
    return laboratoryRowToTs(data);
  },

  async delete(ctx: RepoContext, id: string) {
    const sb = await getClient("laboratory.delete");
    const { error } = await sb
      .from("laboratories").delete()
      .eq("business_id", ctx.businessId).eq("id", id);
    if (error) throw new SupabaseRepositoryError("laboratory.delete", error);
  },
};
