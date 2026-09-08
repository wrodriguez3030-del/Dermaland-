import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext, getSession } from "@/server/auth/context";
import { createServer } from "@/lib/supabase/server";
import { canManageIncentiveRules, isBillingAdmin, isBillingAdmin as esAdminDeNegocio } from "@/features/billing/permissions";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET  /api/users → usuarios del negocio (RLS por business_id vía JWT).
 * POST /api/users → crea un registro de PERSONAL (p. ej. vendedor) para
 *   atribución de ventas/incentivos. NO crea una cuenta de acceso (login);
 *   eso se gestiona por Supabase Auth aparte. business_id de la sesión.
 */
export const dynamic = "force-dynamic";

const VALID_ROLES = new Set([
  "admin",
  "manager",
  "cashier",
  "inventory",
  "supervisor",
  "auditor",
  "vendedor",
]);
const AVATAR_COLORS = ["#00685f", "#0d9488", "#6366f1", "#f59e0b", "#ef4444", "#8b5cf6"];

/**
 * Estado REAL del acceso de cada persona, para que el panel deje de mentir:
 * `users.two_factor_enabled` está en `false` para todos —incluido quien SÍ
 * tiene un factor verificado— y `last_login_at` nunca se escribió. Lo que vale
 * es lo que dice Supabase Auth.
 *
 * Solo para administradores: quién tiene 2FA, quién está bloqueado y cuándo
 * entró cada quien no es información para el mostrador.
 */
async function estadoDeAcceso(
  businessId: string,
): Promise<Map<string, Record<string, unknown>>> {
  const mapa = new Map<string, Record<string, unknown>>();
  const admin = createServiceRoleClient();
  if (!admin) return mapa;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).rpc("resumen_acceso_usuarios", {
    p_business_id: businessId,
  });
  if (error) return mapa;
  for (const f of (data as Array<Record<string, unknown>>) ?? []) {
    mapa.set(String(f.user_id), {
      tieneCuenta: Boolean(f.tiene_cuenta),
      ultimoAcceso: f.ultimo_acceso ?? null,
      bloqueado: Boolean(f.bloqueado),
      totpVerificados: Number(f.totp_verificados) || 0,
      claveGestionada: Boolean(f.clave_gestionada),
      claveDesincronizada: Boolean(f.clave_desincronizada),
      claveAsignadaEl: f.clave_asignada_en ?? null,
      dispositivosActivos: Number(f.dispositivos_activos) || 0,
    });
  }
  return mapa;
}

export async function GET(): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json(
      { error: "Backend de usuarios en modo local (DATA_SOURCE=mock)." },
      { status: 409 },
    );
  }
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    const ctx = await getRepoContext();
    const users = await getRepositories().user.list(ctx);

    const esAdmin = session.isPlatformAdmin || esAdminDeNegocio(session.user.role);
    if (!esAdmin) {
      // 🔴 Proyección reducida. `user.list` hace `select("*")`: sin esto, el
      // teléfono y el correo de TODO el personal viajan al navegador de
      // cualquier cajera que abra una pantalla que llame a esta ruta.
      return NextResponse.json(
        {
          users: users.map((u) => ({
            id: u.id,
            fullName: u.fullName,
            role: u.role,
            branchIds: u.branchIds,
            avatarColor: u.avatarColor,
            status: u.status,
          })),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const acceso = await estadoDeAcceso(session.businessId);
    return NextResponse.json(
      { users: users.map((u) => ({ ...u, ...(acceso.get(u.id) ?? {}) })) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudieron cargar los usuarios.") },
      { status: 400 },
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json({ error: "Disponible solo con Supabase" }, { status: 501 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!canManageIncentiveRules(session.user.role)) {
    return NextResponse.json(
      { error: "No tienes permiso para registrar personal." },
      { status: 403 },
    );
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Body inválido" }, { status: 400 });

  const fullName = String(body.fullName ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const role = String(body.role ?? "vendedor");
  if (!fullName) return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 422 });
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return NextResponse.json({ error: "Email inválido." }, { status: 422 });
  if (!VALID_ROLES.has(role))
    return NextResponse.json({ error: "Rol inválido." }, { status: 422 });
  // DL-08: solo un administrador puede asignar roles de administración; el rol
  // `super_admin` (plataforma) nunca se asigna por esta vía de negocio.
  const actorIsAdmin = session.isPlatformAdmin || isBillingAdmin(session.user.role);
  if (role === "super_admin") {
    return NextResponse.json(
      { error: "No se puede asignar el rol super administrador." },
      { status: 403 },
    );
  }
  if ((role === "admin" || role === "manager") && !actorIsAdmin) {
    return NextResponse.json(
      { error: "Solo un administrador puede asignar roles de administración (admin/gerente)." },
      { status: 403 },
    );
  }

  const sb = await createServer();
  if (!sb) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });

  const branchIds = Array.isArray(body.branchIds)
    ? (body.branchIds as string[]).filter(Boolean)
    : [];
  const color = AVATAR_COLORS[fullName.length % AVATAR_COLORS.length] ?? "#00685f";

  const { data, error } = await sb
    .from("users")
    // id lleva default gen_random_uuid() (mig 0021); el tipo generado aún lo
    // marca requerido, por eso el cast.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({
      business_id: session.businessId,
      email,
      full_name: fullName,
      phone: (body.phone as string) || null,
      role,
      branch_ids: branchIds,
      status: (body.status as string) === "disabled" ? "disabled" : "active",
      avatar_color: color,
    } as any)
    .select("*")
    .single();
  if (error) {
    const msg = error.message.includes("duplicate")
      ? "Ya existe un usuario con ese email."
      : "No se pudo registrar el usuario.";
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  try {
    const repos = getRepositories();
    await repos.audit.log(
      { businessId: session.businessId, userId: session.user.id },
      {
        businessId: session.businessId,
        userId: session.user.id,
        userName: session.user.fullName ?? "",
        action: "users.created",
        entity: "user",
        entityId: data.id,
        metadata: { fullName, role, email },
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
