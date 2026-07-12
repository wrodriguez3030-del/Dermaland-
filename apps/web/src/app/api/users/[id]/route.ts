import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getSession } from "@/server/auth/context";
import { createServer } from "@/lib/supabase/server";
import { getRepositories } from "@/server/repositories";
import { canManageIncentiveRules } from "@/features/billing/permissions";

/**
 * PATCH /api/users/[id] → edita un registro de personal (nombre, rol,
 *   sucursales, estado active/disabled). business_id de la sesión (RLS).
 */
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

const VALID_ROLES = new Set([
  "admin",
  "manager",
  "cashier",
  "inventory",
  "supervisor",
  "auditor",
  "vendedor",
]);

export async function PATCH(req: NextRequest, ctx: Params): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase")
    return NextResponse.json({ error: "Disponible solo con Supabase" }, { status: 501 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!canManageIncentiveRules(session.user.role))
    return NextResponse.json({ error: "No tienes permiso." }, { status: 403 });

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Body inválido" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.fullName !== undefined) patch.full_name = String(body.fullName).trim();
  if (body.phone !== undefined) patch.phone = (body.phone as string) || null;
  if (body.role !== undefined) {
    if (!VALID_ROLES.has(String(body.role)))
      return NextResponse.json({ error: "Rol inválido." }, { status: 422 });
    patch.role = body.role;
  }
  if (body.branchIds !== undefined)
    patch.branch_ids = Array.isArray(body.branchIds)
      ? (body.branchIds as string[]).filter(Boolean)
      : [];
  if (body.status !== undefined)
    patch.status = body.status === "disabled" ? "disabled" : "active";

  const sb = await createServer();
  if (!sb) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { data, error } = await sb
    .from("users")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(patch as any)
    .eq("business_id", session.businessId).eq("id", id)
    .select("*")
    .single();
  if (error)
    return NextResponse.json({ error: "No se pudo actualizar el usuario." }, { status: 422 });

  try {
    const repos = getRepositories();
    await repos.audit.log(
      { businessId: session.businessId, userId: session.user.id },
      {
        businessId: session.businessId,
        userId: session.user.id,
        userName: session.user.fullName ?? "",
        action: "users.updated",
        entity: "user",
        entityId: id,
        metadata: { changes: Object.keys(patch).filter((k) => k !== "updated_at") },
      },
    );
  } catch {
    /* best-effort */
  }

  return NextResponse.json({
    user: {
      id: data.id,
      email: data.email,
      fullName: data.full_name,
      phone: data.phone ?? undefined,
      role: data.role,
      branchIds: data.branch_ids ?? [],
      status: data.status,
      avatarColor: data.avatar_color,
    },
  });
}
