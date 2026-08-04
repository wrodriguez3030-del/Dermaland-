import "server-only";
import { customerStatusMessage } from "@/features/storefront/orders/timeline";
import type { WebOrderStatus } from "@/features/storefront/orders/status";
import { sendEmail } from "@/server/services/email/gmail";
import { resolveGmailCredentials } from "@/server/services/email/email-settings-service";
import { signDocumentShareToken } from "@/server/services/sales/share-token";
import { storefrontBaseUrl } from "./tenant";

/**
 * Avisar al cliente de que su pedido avanzó.
 *
 * Va por el correo DEL NEGOCIO (Gmail configurado en Ajustes → Correo), que no
 * tiene nada que ver con el emisor de Supabase Auth —ese es el que está limitado
 * y por el que las cuentas siguen cerradas—.
 *
 * **Un fallo aquí NUNCA detiene el cambio de estado.** Que no salga un correo no
 * puede impedir que el negocio marque un pedido como listo: se registra y se
 * sigue. Por eso todo devuelve un resultado en vez de lanzar.
 *
 * El correo lleva el enlace del pedido con su token firmado, que es el mismo con
 * el que el cliente lo consulta: no hace falta que tenga cuenta.
 */

export type NotifyOutcome =
  | { sent: true }
  | { sent: false; reason: "sin-aviso" | "sin-correo" | "sin-configurar" | "error" };

export async function notifyOrderStatus(input: {
  businessId: string;
  orderId: string;
  orderNumber: string;
  status: WebOrderStatus;
  fulfillment: "pickup" | "delivery";
  contactEmail?: string;
  siteName: string;
}): Promise<NotifyOutcome> {
  const url = `${storefrontBaseUrl()}/tienda/pedido/${signDocumentShareToken(
    input.businessId,
    input.orderId,
  )}`;

  const mensaje = customerStatusMessage(input.status, input.fulfillment, {
    number: input.orderNumber,
    url,
  });
  // `recibido` no avisa: el cliente acaba de verlo en pantalla.
  if (!mensaje) return { sent: false, reason: "sin-aviso" };

  // El correo es OPCIONAL en el checkout: mucha gente solo deja el teléfono.
  if (!input.contactEmail) return { sent: false, reason: "sin-correo" };

  const creds = await resolveGmailCredentials(input.businessId);
  if (!creds) return { sent: false, reason: "sin-configurar" };

  const res = await sendEmail(
    {
      to: input.contactEmail,
      subject: mensaje.subject,
      html: renderHtml(mensaje.text, url, input.siteName),
    },
    creds,
  );
  return res.ok ? { sent: true } : { sent: false, reason: "error" };
}

/**
 * Correo en HTML sencillo y con estilos EN LÍNEA.
 *
 * Nada de hojas de estilo ni clases: Gmail las descarta. Y nada de imágenes
 * remotas, que los clientes de correo bloquean por defecto y dejarían el mensaje
 * a medias.
 */
function renderHtml(texto: string, url: string, siteName: string): string {
  const parrafos = texto
    .split("\n\n")
    .filter((p) => !p.includes(url))
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1a1a1a">${escapar(p)}</p>`,
    )
    .join("");

  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px">
<p style="margin:0 0 20px;font-size:18px;font-weight:700;color:#00685f">${escapar(siteName)}</p>
${parrafos}
<p style="margin:24px 0">
  <a href="${escapar(url)}" style="display:inline-block;background:#00685f;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;font-size:15px">Ver mi pedido</a>
</p>
<p style="margin:0;font-size:12px;color:#6b7280">Guarda este enlace: con él puedes ver tu pedido cuando quieras.</p>
</div>`;
}

/** El nombre del producto y del negocio los escribe una persona. */
function escapar(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
