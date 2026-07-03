import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/server/auth/context";
import { createServer } from "@/lib/supabase/server";
import { env } from "@/lib/env";

/**
 * POST /api/dgii/sequences/reserve
 *
 * Reserva ATÓMICA del siguiente número e-CF vía la función Postgres
 * `reserve_ecf_sequence_number` (mig 0003, ya aplicada): `SELECT ... FOR
 * UPDATE` + avance del contador en la misma transacción — dos cajas en
 * dispositivos distintos JAMÁS reciben el mismo número (a diferencia de la
 * reserva localStorage del store cliente, que es por navegador). La RLS de
 * `ecf_sequences` limita la reserva al negocio del usuario autenticado.
 *
 * Body: { tipoEcf: "31"|"32"|"33"|"34", ambiente: "testecf"|"certecf"|"ecf" }
 * 200 → { number, eNcf }
 * 409 → sin secuencia activa con rango disponible.
 *
 * NO emite, NO firma, NO toca DGII — solo administra numeración. El POS
 * demo sigue usando el store local; cablearlo a este endpoint cuando
 * DATA_SOURCE=supabase es el paso pendiente de Fase C.
 */

const TIPOS = new Set(["31", "32", "33", "34"]);
const AMBIENTES = new Set(["testecf", "certecf", "ecf"]);

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json(
      { error: "Disponible solo con DATA_SOURCE=supabase" },
      { status: 501 },
    );
  }
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    tipoEcf?: string;
    ambiente?: string;
  };
  if (!body.tipoEcf || !TIPOS.has(body.tipoEcf)) {
    return NextResponse.json(
      { error: "tipoEcf inválido (31|32|33|34)" },
      { status: 400 },
    );
  }
  if (!body.ambiente || !AMBIENTES.has(body.ambiente)) {
    return NextResponse.json(
      { error: "ambiente inválido (testecf|certecf|ecf)" },
      { status: 400 },
    );
  }

  const sb = await createServer();
  if (!sb) {
    return NextResponse.json(
      { error: "Supabase no configurado" },
      { status: 503 },
    );
  }
  const { data, error } = await sb.rpc("reserve_ecf_sequence_number", {
    p_business_id: session.businessId,
    p_tipo_ecf: body.tipoEcf,
    p_ambiente: body.ambiente,
  });
  if (error) {
    return NextResponse.json(
      { error: `Reserva falló: ${error.message}` },
      { status: 500 },
    );
  }
  if (data === null || data === undefined) {
    return NextResponse.json(
      {
        error:
          "No hay secuencia activa con rango disponible para ese tipo/ambiente. " +
          "Configura o amplía el rango en DGII > Secuencias.",
      },
      { status: 409 },
    );
  }

  const num = Number(data);
  const eNcf = `E${body.tipoEcf}${String(num).padStart(10, "0")}`;
  return NextResponse.json({ number: num, eNcf });
}
