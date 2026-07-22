import "server-only";
import nodemailer from "nodemailer";

/**
 * Envío de correo transaccional DESDE la cuenta Gmail de DermaLand
 * (`dermalandrd@gmail.com`) usando SMTP + "Contraseña de aplicación" de Google.
 *
 * El remitente REAL es la cuenta Gmail, así que el cliente ve el correo de
 * DermaLand y sus respuestas llegan ahí. Requiere en el servidor:
 *   - `GMAIL_USER` (por defecto `dermalandrd@gmail.com`)
 *   - `GMAIL_APP_PASSWORD` (16 caracteres, generada en la cuenta de Google con
 *     verificación en 2 pasos activa)
 *
 * Si falta la contraseña, NO lanza: devuelve `{ ok:false, notConfigured:true }`
 * para que la UI ofrezca el respaldo (abrir el cliente de correo del usuario).
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

const DEFAULT_USER = "dermalandrd@gmail.com";

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const user = process.env.GMAIL_USER || DEFAULT_USER;
  // La contraseña de aplicación de Google se copia con espacios; se limpian.
  const pass = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");
  const fromName = process.env.EMAIL_FROM_NAME || "DermaLand";

  if (!pass) {
    return {
      ok: false,
      notConfigured: true,
      error:
        "El envío de correo por el sistema no está configurado (falta GMAIL_APP_PASSWORD).",
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass },
    });

    const info = await transporter.sendMail({
      from: `${fromName} <${user}>`,
      to: input.to,
      subject: input.subject,
      html: input.html,
      replyTo: input.replyTo ?? user,
    });

    return { ok: true, id: info.messageId ?? "" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
