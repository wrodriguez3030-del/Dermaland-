import "server-only";
import type { AuditRepository, RepoContext } from "../types";
import type { AuditLog } from "@/types";
import {
  createServer,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { SupabaseRepositoryError, getClient } from "./client";
import { auditRowToTs } from "./mappers";

export const auditRepository: AuditRepository = {
  async list(ctx: RepoContext, limit = 50) {
    const sb = await getClient("audit.list");
    const { data, error } = await sb
      .from("audit_logs")
      .select("*")
      .eq("business_id", ctx.businessId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new SupabaseRepositoryError("audit.list", error);
    return (data ?? []).map(auditRowToTs);
  },

  async log(ctx: RepoContext, entry: Omit<AuditLog, "id" | "createdAt">) {
    // Preferimos service-role para garantizar que el log persista incluso si
    // RLS bloquea al usuario (los logs son inmutables y deben escribirse
    // SIEMPRE). Si no hay service-role configurado, intentamos con el
    // cliente normal — y si tampoco hay, advertimos por consola y no
    // rompemos el flujo del caller.
    const row = {
      business_id: ctx.businessId,
      user_id: entry.userId || null,
      user_name: entry.userName || null,
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entityId,
      branch_id: entry.branchId ?? null,
      metadata: entry.metadata ?? null,
      ip_address: entry.ipAddress ?? null,
    };

    const admin = createServiceRoleClient();
    if (admin) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (admin as any).from("audit_logs").insert(row);
      if (error) {
        // No re-throw — auditar nunca debe romper el flujo del usuario.
        console.warn("[audit.log] service-role insert falló:", error.message);
      }
      return;
    }

    const sb = await createServer();
    if (!sb) {
      console.warn(
        "[audit.log] Supabase no configurado — entry descartada:",
        entry.action,
      );
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb as any).from("audit_logs").insert(row);
    if (error) {
      console.warn("[audit.log] insert con anon falló:", error.message);
    }
  },
};
