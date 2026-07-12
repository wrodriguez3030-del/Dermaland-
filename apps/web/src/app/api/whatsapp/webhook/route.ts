import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { whatsappService } from "@/server/services/whatsapp/service";

/**
 * SEC-004: valida la firma HMAC-SHA256 de Meta (`X-Hub-Signature-256`) sobre el
 * body CRUDO con el App Secret. Si `WHATSAPP_APP_SECRET` está configurado, un
 * evento sin firma válida se rechaza (evita eventos falsificados). Comparación
 * en tiempo constante. Si no hay secreto configurado, no se puede validar
 * (modo stub actual) — DEBE configurarse antes de persistir eventos reales.
 */
function verifyMetaSignature(rawBody: string, header: string | null): boolean {
  const secret = env.WHATSAPP_APP_SECRET;
  if (!secret) return true; // sin secreto no se puede validar (stub)
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const got = header.slice("sha256=".length);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(got, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

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
  // Leer el body CRUDO (necesario para el HMAC — no el JSON parseado).
  const raw = await request.text();
  if (!verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const events = await whatsappService.handleWebhook(body);
  // En producción: persistir cada event en `conversation_messages` /
  // `outbound_messages` con la actualización de status correspondiente.
  return NextResponse.json({ received: events.length });
}
