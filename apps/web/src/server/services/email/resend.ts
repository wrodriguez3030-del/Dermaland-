import "server-only";

/**
 * Envío de correo transaccional vía Resend (API REST, sin dependencia npm).
 *
 * Requiere `RESEND_API_KEY` y `EMAIL_FROM` en el servidor. Si falta la key, la
 * función NO lanza: devuelve `{ ok:false, notConfigured:true }` para que la UI
 * muestre "correo no configurado" y ofrezca el respaldo (abrir el cliente de
 * correo). El dominio de `EMAIL_FROM` debe estar verificado en Resend (o usar
 * `onboarding@resend.dev` para pruebas).
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string; notConfigured?: boolean };

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "DermaLand <onboarding@resend.dev>";

  if (!apiKey) {
    return {
      ok: false,
      notConfigured: true,
      error:
        "El envío de correo por el sistema no está configurado (falta RESEND_API_KEY).",
    };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        error: body.message ?? `No se pudo enviar el correo (HTTP ${res.status}).`,
      };
    }
    return { ok: true, id: body.id ?? "" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
