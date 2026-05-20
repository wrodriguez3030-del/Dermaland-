import "server-only";
import type { BusinessRepository, RepoContext } from "../types";
import type { Business } from "@/types";
import { SupabaseRepositoryError, getClient } from "./client";
import { businessRowToTs } from "./mappers";

function patchToRow(patch: Partial<Business>): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  if (patch.legalName !== undefined) r.legal_name = patch.legalName;
  if (patch.commercialName !== undefined) r.commercial_name = patch.commercialName;
  if (patch.rnc !== undefined) r.rnc = patch.rnc;
  if (patch.country !== undefined) r.country = patch.country;
  if (patch.phone !== undefined) r.phone = patch.phone;
  if (patch.whatsapp !== undefined) r.whatsapp = patch.whatsapp;
  if (patch.email !== undefined) r.email = patch.email;
  if (patch.instagramUrl !== undefined) r.instagram_url = patch.instagramUrl;
  if (patch.logoUrl !== undefined) r.logo_url = patch.logoUrl;
  if (patch.dgiiEnabled !== undefined) r.dgii_enabled = patch.dgiiEnabled;
  if (patch.planId !== undefined) r.plan_id = patch.planId;
  if (patch.status !== undefined) r.status = patch.status;
  return r;
}

export const businessRepository: BusinessRepository = {
  async current(ctx: RepoContext) {
    const sb = await getClient("business.current");
    const { data, error } = await sb
      .from("businesses")
      .select("*")
      .eq("id", ctx.businessId)
      .maybeSingle();
    if (error) throw new SupabaseRepositoryError("business.current", error);
    return data ? businessRowToTs(data) : null;
  },

  async update(ctx: RepoContext, patch: Partial<Business>) {
    const sb = await getClient("business.update");
    const row = patchToRow(patch);
    row.updated_at = new Date().toISOString();
    const { data, error } = await sb
      .from("businesses")
      .update(row)
      .eq("id", ctx.businessId)
      .select("*")
      .single();
    if (error) throw new SupabaseRepositoryError("business.update", error);
    return businessRowToTs(data);
  },
};
