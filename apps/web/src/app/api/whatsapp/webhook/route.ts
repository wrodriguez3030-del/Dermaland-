import { NextResponse } from "next/server";
import { whatsappService } from "@/server/services/whatsapp/service";

/**
 * GET — verify handshake con Meta.
 * POST — eventos entrantes (mensajes, statuses).
 *
 * No requiere auth de usuario — Meta verifica con `hub.verify_token`.
 * Validación de firma adicional (SHA-256 con app secret) recomendada
 * antes de producción.
 */

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode") ?? "";
  const token = url.searchParams.get("hub.verify_token") ?? "";
  const challenge = url.searchParams.get("hub.challenge") ?? "";

  const ok = whatsappService.verifyWebhook(mode, token, challenge);
  if (ok) return new Response(ok, { status: 200 });
  return NextResponse.json({ error: "verify_failed" }, { status: 403 });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const events = await whatsappService.handleWebhook(body);
  // En producción: persistir cada event en `conversation_messages` /
  // `outbound_messages` con la actualización de status correspondiente.
  return NextResponse.json({ received: events.length });
}
