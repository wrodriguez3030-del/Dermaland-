import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { getSession } from "@/server/auth/context";
import { authorizeRole } from "@/server/auth/require-role";
import { requireAal2 } from "@/server/auth/require-aal2";
import { createServer } from "@/lib/supabase/server";
import { fijarClave } from "@/server/services/users/access-service";
import { BUSINESS_ADMIN_ROLES } from "@/features/billing/permissions";

/**
 * PUT /api/users/[id]/clave → fija la clave de un usuario, creando su cuenta de
 * acceso si no la tenía.
 *
 * Las puertas, en este orden y todas necesarias:
 *   1. Supabase configurado.
 *   2. Sesión.
 *   3. Rol de administrador.
 *   4. 🔴 SEGUNDO FACTOR usado en esta sesión (`requireAal2`). Con la
 *      computadora de confianza, un administrador entra a diario sin teclear el
 *      código; para apoderarse de una cuenta ajena no debería bastar con
 *      sentarse en su silla.
 *   5. La ficha existe y es de este negocio.
 *   6. Jerarquía (dentro de `fijarClave`): un admin no le fija la clave a otro.
 *
 * La clave viaja en el cuerpo y NUNCA en la URL: la query queda en los registros
 * del servidor y en el historial del navegador.
 */
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

const cuerpoSchema = z.object({ password: z.string().min(1) });

export async function PUT(req: NextRequest, ctx: Params): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json({ error: "Disponible solo con Supabase." }, { status: 501 });
  }
  const auth = await authorizeRole(BUSINESS_ADMIN_ROLES);
  if (!auth.ok) return auth.res;
  const paso2 = await requireAal2();
  if (!paso2.ok) return paso2.res;

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { id } = await ctx.params;
  const parsed = cuerpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Falta la clave." }, { status: 400 });
  }

  const sb = await createServer();
  if (!sb) return NextResponse.json({ error: "Supabase no configurado." }, { status: 503 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: fila, error } = await (sb as any)
    .from("users")
    .select("id,business_id,email,full_name,role,branch_ids")
    .eq("business_id", session.businessId)
    .eq("id", id)
    .maybeSingle();
  if (error || !fila) {
    return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  }

  try {
    const r = await fijarClave(
      {
        id: session.user.id,
        role: session.user.role,
        isPlatformAdmin: session.isPlatformAdmin,
        businessId: session.businessId,
        nombre: session.user.fullName ?? "",
      },
      {
        id: String(fila.id),
        businessId: String(fila.business_id),
        email: String(fila.email),
        fullName: String(fila.full_name),
        role: String(fila.role),
        branchIds: Array.isArray(fila.branch_ids) ? (fila.branch_ids as string[]) : [],
      },
      parsed.data.password,
    );
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json(
      { ok: true, cuentaCreada: r.cuentaCreada },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    // 🔴 El mensaje del error de abajo puede llevar detalles del sobre o de la
    // llave; se sustituye por uno propio y no se registra el original con la
    // clave en el aire.
    return NextResponse.json(
      { error: "No se pudo fijar la clave. Revisa la configuración del servidor." },
      { status: 500 },
    );
  }
}
