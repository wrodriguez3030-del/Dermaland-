import "server-only";
import nodemailer from "nodemailer";

/**
 * Envío de correo transaccional DESDE la cuenta Gmail de DermaLand vía SMTP +
 * "Contraseña de aplicación" de Google. El remitente REAL es la cuenta Gmail,
 * así que el cliente ve el correo de DermaLand y sus respuestas llegan ahí.
 *
 * Las credenciales se resuelven fuera (ver `resolveGmailCredentials`): primero
 * la configuración guardada en el sistema (Configuración → Correo, cifrada en la
 * BD), y como respaldo las variables de entorno. Aquí solo se envía.
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export interface GmailCredentials {
  user: string;
  pass: string;
}

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function sendEmail(
  input: SendEmailInput,
  creds: GmailCredentials,
): Promise<SendEmailResult> {
  const user = creds.user;
  const pass = (creds.pass || "").replace(/\s+/g, "");
  const fromName = process.env.EMAIL_FROM_NAME || "DermaLand";

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
