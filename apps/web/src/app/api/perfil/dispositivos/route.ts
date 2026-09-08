import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getSession } from "@/server/auth/context";
import { listarDe, revocar } from "@/server/services/auth/trusted-devices";

/**
 * Las computadoras de confianza DE UNO MISMO: verlas y olvidarlas.
 *
 * Cualquiera con sesión, porque son suyas. La consulta y el borrado van
 * acotados a `session.user.id` en el servidor: el id NUNCA sale del cuerpo ni
 * de la URL, así que no hay forma de pedir o revocar los de otra persona.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json({ dispositivos: [] }, { headers: { "Cache-Control": "no-store" } });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  return NextResponse.json(
    { dispositivos: await listarDe(session.user.id) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json({ error: "Disponible solo con Supabase." }, { status: 501 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  // Sin `deviceId` se olvidan todas. El id de usuario sale de la SESIÓN.
  const deviceId = req.nextUrl.searchParams.get("deviceId") ?? undefined;
  const cuantos = await revocar({
    userId: session.user.id,
    ...(deviceId && { deviceId }),
    por: session.user.id,
    motivo: "revocado por el propio usuario",
  });
  return NextResponse.json({ revocados: cuantos }, { headers: { "Cache-Control": "no-store" } });
}
