import "server-only";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { AiAccessError } from "./guard";
import { AiServiceError } from "./provider-service";

/** 409 si el backend no está en modo Supabase (la UI hace fallback local). */
export function requireSupabase(): NextResponse | null {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json(
      { error: "El módulo de IA requiere Supabase (DATA_SOURCE=supabase)." },
      { status: 409 },
    );
  }
  return null;
}

/**
 * Traduce cualquier error a una respuesta AMIGABLE. NUNCA expone stack trace,
 * SQL, la API key ni la respuesta cruda del proveedor.
 */
export function aiErrorResponse(e: unknown): NextResponse {
  if (e instanceof AiAccessError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  if (e instanceof AiServiceError) {
    const status = e.code === "not_found" ? 404 : e.code === "limit_reached" ? 429 : 400;
    return NextResponse.json({ error: e.message }, { status });
  }
  // Mensaje genérico: no filtramos el detalle interno.
  const message =
    e instanceof Error && e.message && e.message.length < 200
      ? e.message
      : "No se pudo completar la operación de IA.";
  return NextResponse.json({ error: message }, { status: 400 });
}
