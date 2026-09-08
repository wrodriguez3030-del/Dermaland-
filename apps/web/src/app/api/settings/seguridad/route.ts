import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { getSession } from "@/server/auth/context";
import { authorizeRole } from "@/server/auth/require-role";
import { requireAal2 } from "@/server/auth/require-aal2";
import { auditarOFallar } from "@/server/services/users/auditoria-estricta";
import {
  getTrustedDeviceDays,
  setTrustedDeviceDays,
  DIAS_MAXIMOS,
} from "@/server/services/security/security-settings";
import { BUSINESS_ADMIN_ROLES } from "@/features/billing/permissions";

/**
 * Ajustes de seguridad del negocio.
 *
 * GET  → cualquiera con sesión. La pantalla del segundo factor necesita saber
 *        si ofrecer la casilla «recordar esta computadora» y con cuántos días;
 *        el número no es un secreto y esconderlo obligaría a enseñar una
 *        casilla que a lo mejor no hace nada.
 * PUT  → administradores, y con el segundo factor usado en esta sesión: subir
 *        estos días alarga cuánto tiempo se puede entrar sin código, así que
 *        no debería poder hacerlo quien solo se sentó en una silla abierta.
 */
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  trustedDeviceDays: z.number().int().min(0).max(DIAS_MAXIMOS),
});

export async function GET(): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json({ trustedDeviceDays: 0 }, { headers: { "Cache-Control": "no-store" } });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const dias = await getTrustedDeviceDays(session.businessId);
  return NextResponse.json({ trustedDeviceDays: dias }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json({ error: "Disponible solo con Supabase." }, { status: 501 });
  }
  const auth = await authorizeRole(BUSINESS_ADMIN_ROLES);
  if (!auth.ok) return auth.res;
  const paso2 = await requireAal2();
  if (!paso2.ok) return paso2.res;

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Los días deben ir de 0 a ${DIAS_MAXIMOS}.` },
      { status: 400 },
    );
  }

  const antes = await getTrustedDeviceDays(session.businessId);
  const r = await setTrustedDeviceDays(
    session.businessId,
    parsed.data.trustedDeviceDays,
    session.user.id,
  );
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });

  try {
    await auditarOFallar({
      businessId: session.businessId,
      actorId: session.user.id,
      actorNombre: session.user.fullName ?? "",
      action: "security.settings_updated",
      entityId: session.businessId,
      metadata: { trustedDeviceDays: { de: antes, a: r.dias } },
    });
  } catch {
    /* el ajuste ya se guardó; no dejarlo a medias por no poder anotarlo */
  }

  return NextResponse.json(
    { trustedDeviceDays: r.dias },
    { headers: { "Cache-Control": "no-store" } },
  );
}
