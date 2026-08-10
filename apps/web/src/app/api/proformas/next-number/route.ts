import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getRepoContext } from "@/server/auth/context";
import { authorizeRole } from "@/server/auth/require-role";
import { POS_SALE_ROLES } from "@/features/billing/permissions";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Siguiente número de proforma, reservado en la base.
 *
 * Hasta ahora este número salía del `localStorage` del cajero: la reserva en
 * servidor existía sólo para comprobantes fiscales, porque una proforma «no
 * consume secuencia fiscal». Cierto, pero la tabla tiene un índice único
 * (business_id, number) y dos equipos con contadores distintos acaban pidiendo
 * el mismo número. Cuando pasa, el insert falla con 23505 y el cajero lee «Ya
 * existe un registro con esos datos» justo al cobrar.
 *
 * Lo piden los mismos roles que pueden vender (`POS_SALE_ROLES`): reservar un
 * número es parte de emitir. Lo que nadie puede es elegir el número ni el
 * negocio — ambos salen del contexto de servidor.
 */
export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json(
      { error: "La numeración compartida necesita Supabase activo." },
      { status: 409 },
    );
  }
  try {
    const auth = await authorizeRole(POS_SALE_ROLES);
    if (!auth.ok) return auth.res;

    const ctx = await getRepoContext();
    const admin = createServiceRoleClient();
    if (!admin) {
      return NextResponse.json({ error: "No disponible." }, { status: 503 });
    }

    // `business_id` del contexto de servidor, NUNCA del cuerpo: es lo que impide
    // que alguien reserve números en la numeración de otro negocio.
    const { data, error } = await admin.rpc("next_proforma_number", {
      p_business_id: ctx.businessId,
    });
    if (error || !data) {
      return NextResponse.json(
        { error: "No se pudo reservar el número de proforma." },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { number: data as string },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudo reservar el número de proforma." },
      { status: 500 },
    );
  }
}
