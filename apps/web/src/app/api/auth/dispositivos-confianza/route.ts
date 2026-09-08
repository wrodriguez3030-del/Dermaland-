import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { env } from "@/lib/env";
import { getSession } from "@/server/auth/context";
import { requireAal2 } from "@/server/auth/require-aal2";
import { createServer } from "@/lib/supabase/server";
import { getTrustedDeviceDays } from "@/server/services/security/security-settings";
import { crearDispositivo } from "@/server/services/auth/trusted-devices";
import { auditarOFallar } from "@/server/services/users/auditoria-estricta";

/**
 * Marca ESTA computadora como de confianza, tras haber pasado el segundo
 * factor.
 *
 * 🔴 Exige `requireAal2`: la computadora se gana la confianza pasando el
 * código, no pidiéndolo. Sin esta puerta, cualquiera con la sesión robada se
 * daría de alta una galleta y no volvería a ver el segundo factor nunca.
 *
 * También exige que el negocio tenga los días configurados (> 0): si el
 * administrador apagó la función, aquí no se enciende por la puerta de atrás.
 */
export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json({ error: "Disponible solo con Supabase." }, { status: 501 });
  }
  const paso2 = await requireAal2();
  if (!paso2.ok) return paso2.res;

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const dias = await getTrustedDeviceDays(session.businessId);
  if (dias <= 0) {
    return NextResponse.json(
      { error: "Recordar computadoras está desactivado en este negocio." },
      { status: 409 },
    );
  }

  // El factor con el que se acaba de verificar: si mañana se retira, esta
  // computadora deja de valer sola.
  const sb = await createServer();
  const { data: factores } = (await sb?.auth.mfa.listFactors()) ?? { data: null };
  const totp = factores?.totp?.find((f) => f.status === "verified");
  if (!totp) {
    return NextResponse.json({ error: "No hay un segundo factor verificado." }, { status: 409 });
  }

  const galleta = await crearDispositivo({
    userId: session.user.id,
    businessId: session.businessId,
    factorId: totp.id,
    dias,
    ua: (await headers()).get("user-agent"),
  });
  if (!galleta) {
    return NextResponse.json({ error: "No se pudo recordar esta computadora." }, { status: 500 });
  }

  (await cookies()).set(galleta.nombre, galleta.valor, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: galleta.maxAge,
  });

  try {
    await auditarOFallar({
      businessId: session.businessId,
      actorId: session.user.id,
      actorNombre: session.user.fullName ?? "",
      action: "auth.trusted_device_created",
      entityId: session.user.id,
      metadata: { dias },
    });
  } catch {
    /* la galleta ya está puesta; no deshacerla por no poder anotarlo */
  }

  return NextResponse.json({ ok: true, dias }, { headers: { "Cache-Control": "no-store" } });
}
