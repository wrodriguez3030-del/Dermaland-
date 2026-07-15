import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { getRepoContext, getSession } from "@/server/auth/context";
import { getRepositories } from "@/server/repositories";
import { canManageArSettings } from "@/features/receivables/permissions";
import { getSettings, saveSettings } from "@/server/services/receivables/service";

export const dynamic = "force-dynamic";

function notSupabase() {
  return NextResponse.json(
    { error: "Cuentas por cobrar requiere el backend real (DATA_SOURCE=supabase)." },
    { status: 409 },
  );
}

export async function GET(): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const ctx = await getRepoContext();
    return NextResponse.json({ settings: await getSettings(ctx) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudo cargar la configuración.") },
      { status: 400 },
    );
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    if (!canManageArSettings(session.user.role)) {
      return NextResponse.json({ error: "Solo un administrador puede cambiar la configuración." }, { status: 403 });
    }
    const body = await req.json();
    const ctx = await getRepoContext();
    const settings = await saveSettings(ctx, {
      defaultCreditDays: Number(body?.defaultCreditDays ?? 30),
      blockOverLimit: Boolean(body?.blockOverLimit),
      reminderOffsetsDays: Array.isArray(body?.reminderOffsetsDays)
        ? body.reminderOffsetsDays.map((n: unknown) => Number(n)).filter((n: number) => Number.isFinite(n))
        : [-7, -3, -1, 0, 1, 7, 15, 30],
    });
    await getRepositories().audit.log(ctx, {
      businessId: ctx.businessId,
      userId: session.user.id,
      userName: session.user.fullName,
      action: "ar.settings_update",
      entity: "ar_settings",
      entityId: ctx.businessId,
      branchId: ctx.branchId,
      metadata: settings as unknown as Record<string, unknown>,
    });
    return NextResponse.json({ settings });
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudo guardar la configuración.") },
      { status: 400 },
    );
  }
}
