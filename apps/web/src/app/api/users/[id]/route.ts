import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getSession } from "@/server/auth/context";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getRepositories } from "@/server/repositories";
import { canManageIncentiveRules, isBillingAdmin } from "@/features/billing/permissions";
import { sincronizarClaims } from "@/server/services/users/claims-sync";

/**
 * PATCH /api/users/[id] → edita un registro de personal (nombre, rol,
 *   sucursales, estado active/disabled). business_id de la sesión (RLS).
 *
 * 🔴 Y SINCRONIZA EL ACCESO. Hasta ahora esto cambiaba `users.role` y nada
 * más, pero la autorización del sistema lee el rol de `app_metadata`
 * (SEC-001): el panel enseñaba «Gerente» y la persona seguía entrando como
 * cajera. El rol que se veía no era el que se aplicaba. Lo mismo con el
 * estado: deshabilitar a alguien no le impedía entrar, porque su cuenta de
 * Auth seguía viva.
 *
 * Si la ficha se guarda pero el acceso no, se responde 502 DICIÉNDOLO: dejar
 * que parezca que todo salió bien es como se llega a un usuario deshabilitado
 * que sigue entrando.
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
    const nextRole = String(body.role);
    if (!VALID_ROLES.has(nextRole))
      return NextResponse.json({ error: "Rol inválido." }, { status: 422 });
    // DL-08: solo un administrador puede elevar a admin/gerente; super_admin nunca por esta vía.
    const actorIsAdmin = session.isPlatformAdmin || isBillingAdmin(session.user.role);
    if (nextRole === "super_admin")
      return NextResponse.json({ error: "No se puede asignar el rol super administrador." }, { status: 403 });
    if ((nextRole === "admin" || nextRole === "manager") && !actorIsAdmin)
      return NextResponse.json({ error: "Solo un administrador puede asignar roles de administración (admin/gerente)." }, { status: 403 });
    patch.role = nextRole;
  }
  if (body.branchIds !== undefined)
    patch.branch_ids = Array.isArray(body.branchIds)
      ? (body.branchIds as string[]).filter(Boolean)
      : [];
  if (body.status !== undefined)
    patch.status = body.status === "disabled" ? "disabled" : "active";

  // 🔴 service_role: desde la migración 20260909100000 `users` no se escribe
  // con el rol `authenticated` (ver el porqué en `POST /api/users`). El
  // `.eq("business_id")` de abajo deja de ser defensa en profundidad y pasa a
  // ser LA barrera entre negocios, porque service_role se salta la RLS.
  const sb = createServiceRoleClient();
  if (!sb) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const { data, error } = await (sb as unknown as {
    from: (t: string) => {
      update: (p: unknown) => {
        eq: (c: string, v: string) => {
          eq: (c: string, v: string) => {
            select: (s: string) => { single: () => Promise<{ data: Record<string, unknown>; error: unknown }> };
          };
        };
      };
    };
  })
    .from("users")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(patch as any)
    .eq("business_id", session.businessId).eq("id", id)
    .select("*")
    .single();
  if (error)
    return NextResponse.json({ error: "No se pudo actualizar el usuario." }, { status: 422 });

  // El acceso se sincroniza SOLO con lo que esta ruta acaba de validar, nunca
  // leyendo la fila: hasta la migración 20260909100000 cualquier empleado podía
  // escribir cualquier fila de `users` por PostgREST, y derivar los claims de
  // ahí convertiría ese fallo en una escalada a administrador.
  const tocaElAcceso =
    body.role !== undefined || body.status !== undefined || body.branchIds !== undefined || body.fullName !== undefined;
  if (tocaElAcceso) {
    const sync = await sincronizarClaims(id, {
      ...(body.role !== undefined && { role: String(body.role) }),
      ...(body.fullName !== undefined && { fullName: String(body.fullName).trim() }),
      ...(body.branchIds !== undefined && {
        branchIds: Array.isArray(body.branchIds) ? (body.branchIds as string[]).filter(Boolean) : [],
      }),
      ...(body.status !== undefined && {
        status: body.status === "disabled" ? ("disabled" as const) : ("active" as const),
      }),
    });
    // «No tiene cuenta de acceso» no es un fallo: la mayoría del personal aún
    // no la tiene, y su ficha se edita igual.
    if (!sync.sincronizado && sync.motivo !== "El usuario no tiene cuenta de acceso.") {
      try {
        const repos = getRepositories();
        await repos.audit.log(
          { businessId: session.businessId, userId: session.user.id },
          {
            businessId: session.businessId,
            userId: session.user.id,
            userName: session.user.fullName ?? "",
            action: "users.claims_sync_failed",
            entity: "user",
            entityId: id,
            metadata: { motivo: sync.motivo },
          },
        );
      } catch {
        /* best-effort */
      }
      return NextResponse.json(
        {
          error:
            "Se guardó la ficha, pero NO se pudo aplicar el cambio al acceso: la persona sigue entrando con lo que tenía. Vuelve a intentarlo.",
        },
        { status: 502 },
      );
    }
  }

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
