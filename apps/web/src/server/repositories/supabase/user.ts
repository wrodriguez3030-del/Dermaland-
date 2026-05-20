import "server-only";
import { createServer } from "@/lib/supabase/server";
import type { RepoContext, UserRepository } from "../types";
import { SupabaseRepositoryError, getClient } from "./client";
import { userRowToTs } from "./mappers";

export const userRepository: UserRepository = {
  async list(ctx: RepoContext) {
    const sb = await getClient("user.list");
    const { data, error } = await sb
      .from("users")
      .select("*")
      .eq("business_id", ctx.businessId)
      .is("deleted_at", null)
      .order("full_name", { ascending: true });
    if (error) throw new SupabaseRepositoryError("user.list", error);
    return (data ?? []).map(userRowToTs);
  },

  async byId(ctx: RepoContext, id: string) {
    const sb = await getClient("user.byId");
    const { data, error } = await sb
      .from("users")
      .select("*")
      .eq("business_id", ctx.businessId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new SupabaseRepositoryError("user.byId", error);
    return data ? userRowToTs(data) : null;
  },

  async current() {
    // Si Supabase no está configurado, devolvemos null sin lanzar — el
    // caller debe poder distinguir "no autenticado" de "no implementado".
    const sb = await createServer();
    if (!sb) return null;
    const {
      data: { user: authUser },
      error: authError,
    } = await sb.auth.getUser();
    if (authError || !authUser) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .from("users")
      .select("*")
      .eq("id", authUser.id)
      .maybeSingle();
    if (error) throw new SupabaseRepositoryError("user.current", error);
    return data ? userRowToTs(data) : null;
  },
};
