import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { getRepoContext } from "@/server/auth/context";
import { getClient, toUserFacingMessage } from "@/server/repositories/supabase/client";

/**
 * Cuántos clientes se dieron de alta en un período.
 *
 * 🔴 POR QUÉ EXISTE: el panel hacía
 * `customers.filter(c => matchesPeriod(c.createdAt, …)).length` — es decir, se
 * descargaba los 6 525 clientes al navegador (2,6 MB de JSON, medidos) PARA
 * CONTAR. Esa sola tarjeta era casi la mitad de lo que pesaba abrir el panel.
 *
 * Contar es trabajo de la base. Se usa el encabezado `count` de PostgREST
 * (`head: true`, sin traer ni una fila), que NO es una función de agregado —
 * las de agregado están desactivadas en este proyecto y devuelven PGRST123.
 */
export const dynamic = "force-dynamic";

/**
 * El período llega como mes y año, IGUAL que el filtro del panel
 * (`matchesPeriod`), no como un rango de fechas ya cocinado.
 *
 * 🔴 Y es a propósito: «mes 9, todos los años» NO es un rango. Traducirlo a uno
 * daría un número falso —contaría todos los clientes— y una tarjeta que dice
 * «6 525 clientes nuevos este mes» no se distingue de un dato bueno. Aquí se
 * arma un `or` de un rango POR AÑO, que es lo que esa combinación significa.
 */
const querySchema = z.object({
  mes: z.coerce.number().int().min(1).max(12).optional(),
  anio: z.coerce.number().int().min(2000).max(2100).optional(),
});

/** Primer año con datos. Antes de esto el negocio no existía. */
const PRIMER_ANIO = 2018;

/** `[desde, hastaExclusivo]` en ISO para un mes concreto (UTC, como `matchesPeriod`). */
function rangoDeMes(anio: number, mes: number): [string, string] {
  const dd = (n: number) => String(n).padStart(2, "0");
  const desde = `${anio}-${dd(mes)}-01T00:00:00.000Z`;
  const hasta =
    mes === 12 ? `${anio + 1}-01-01T00:00:00.000Z` : `${anio}-${dd(mes + 1)}-01T00:00:00.000Z`;
  return [desde, hasta];
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json({ total: 0 }, { headers: { "Cache-Control": "no-store" } });
  }
  const p = req.nextUrl.searchParams;
  const parsed = querySchema.safeParse({
    ...(p.get("mes") && { mes: p.get("mes") }),
    ...(p.get("anio") && { anio: p.get("anio") }),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Período inválido." }, { status: 400 });
  }
  const { mes, anio } = parsed.data;

  try {
    const ctx = await getRepoContext();
    const sb = await getClient("customer.contarNuevos");
    let q = sb
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("business_id", ctx.businessId)
      .is("deleted_at", null);
    // Los límites superiores son EXCLUSIVOS: `created_at` es un instante, y un
    // `<= '2026-09-30'` dejaría fuera todo lo creado ese día después de
    // medianoche — es decir, casi todo el día.
    if (anio !== undefined && mes !== undefined) {
      const [desde, hasta] = rangoDeMes(anio, mes);
      q = q.gte("created_at", desde).lt("created_at", hasta);
    } else if (anio !== undefined) {
      q = q
        .gte("created_at", `${anio}-01-01T00:00:00.000Z`)
        .lt("created_at", `${anio + 1}-01-01T00:00:00.000Z`);
    } else if (mes !== undefined) {
      // Ese mes, de CUALQUIER año: un rango por año, unidos con `or`.
      const hasta = new Date().getUTCFullYear();
      const clausulas: string[] = [];
      for (let a = PRIMER_ANIO; a <= hasta; a++) {
        const [d, h] = rangoDeMes(a, mes);
        clausulas.push(`and(created_at.gte.${d},created_at.lt.${h})`);
      }
      q = q.or(clausulas.join(","));
    }
    const { count, error } = await q;
    if (error) throw error;
    return NextResponse.json(
      { total: count ?? 0 },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudo contar los clientes nuevos.") },
      { status: 400 },
    );
  }
}
