import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getSession } from "@/server/auth/context";
import { authorizeRole } from "@/server/auth/require-role";
import { requireAal2 } from "@/server/auth/require-aal2";
import { createServer } from "@/lib/supabase/server";
import { listarDe, revocar } from "@/server/services/auth/trusted-devices";
import { puedeGestionarClaveDe } from "@/features/auth/jerarquia-de-claves";
import { auditarOFallar } from "@/server/services/users/auditoria-estricta";
import { BUSINESS_ADMIN_ROLES } from "@/features/billing/permissions";

/**
 * Las computadoras de confianza de OTRA persona: verlas y olvidarlas desde el
 * panel. Es lo que hace falta cuando alguien pierde una laptop.
 *
 * Mismas puertas que las claves: administrador, segundo factor real, misma
 * empresa y jerarquía. Retirarle a alguien sus computadoras de confianza es
 * una acción sobre su cuenta, igual que cambiarle la clave.
 */
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

async function fichaDelNegocio(id: string, businessId: string) {
  const sb = await createServer();
  if (!sb) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb as any)
    .from("users")
    .select("id,role")
    .eq("business_id", businessId)
    .eq("id", id)
    .maybeSingle();
  return data ? { id: String(data.id), role: String(data.role) } : null;
}

export async function GET(_req: NextRequest, ctx: Params): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json({ dispositivos: [] }, { headers: { "Cache-Control": "no-store" } });
  }
  const auth = await authorizeRole(BUSINESS_ADMIN_ROLES);
  if (!auth.ok) return auth.res;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { id } = await ctx.params;
  const ficha = await fichaDelNegocio(id, session.businessId);
  if (!ficha) return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  if (
    !puedeGestionarClaveDe(
      { id: session.user.id, role: session.user.role, isPlatformAdmin: session.isPlatformAdmin },
      ficha,
    )
  ) {
    return NextResponse.json({ error: "No puedes ver esto." }, { status: 403 });
  }
  return NextResponse.json(
    { dispositivos: await listarDe(ficha.id) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(req: NextRequest, ctx: Params): Promise<NextResponse> {
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
  const ficha = await fichaDelNegocio(id, session.businessId);
  if (!ficha) return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  if (
    !puedeGestionarClaveDe(
      { id: session.user.id, role: session.user.role, isPlatformAdmin: session.isPlatformAdmin },
      ficha,
    )
  ) {
    return NextResponse.json({ error: "No puedes hacer esto." }, { status: 403 });
  }

  const deviceId = req.nextUrl.searchParams.get("deviceId") ?? undefined;
  const cuantos = await revocar({
    userId: ficha.id,
    ...(deviceId && { deviceId }),
    por: session.user.id,
    motivo: "revocado por un administrador",
  });
  try {
    await auditarOFallar({
      businessId: session.businessId,
      actorId: session.user.id,
      actorNombre: session.user.fullName ?? "",
      action: "auth.trusted_device_revoked",
      entityId: ficha.id,
      metadata: { revocados: cuantos, deviceId: deviceId ?? "todos" },
    });
  } catch {
    /* ya se revocó; no dejarlo a medias por no poder anotarlo */
  }
  return NextResponse.json({ revocados: cuantos }, { headers: { "Cache-Control": "no-store" } });
}
