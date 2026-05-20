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
};
