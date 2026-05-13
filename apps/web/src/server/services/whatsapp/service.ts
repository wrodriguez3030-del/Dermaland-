import "server-only";
import { env, isWhatsappConfigured } from "@/lib/env";

/**
 * WhatsApp Cloud API service.
 *
 * Implementación contra Meta Cloud API. Auth Bearer con token de la app
 * Business. Webhook en POST /api/whatsapp/webhook con verify token.
 *
 * Plan-maestro Fase 6. Riesgos: R-WA-01, R-WA-02.
 */

export class WhatsappNotConfigured extends Error {
  constructor() {
    super(
      "WhatsApp Cloud API no configurada. Setea WHATSAPP_ACCESS_TOKEN y " +
        "WHATSAPP_PHONE_NUMBER_ID en `.env`.",
    );
    this.name = "WhatsappNotConfigured";
  }
}

export interface SendTemplateParams {
  to: string; // E.164: +18095551234
  templateName: string;
  languageCode?: string;
  variables?: string[];
}

export interface SendTextParams {
  to: string;
  text: string;
}

export interface WhatsappSendResult {
  messageId: string;
  status: "queued" | "sent";
}

export interface WhatsappWebhookEvent {
  type: "message" | "status";
  conversationId?: string;
  payload: unknown;
}

export interface WhatsappService {
  sendTemplateMessage(p: SendTemplateParams): Promise<WhatsappSendResult>;
  sendTextMessage(p: SendTextParams): Promise<WhatsappSendResult>;
  handleWebhook(body: unknown): Promise<WhatsappWebhookEvent[]>;
  updateMessageStatus(
    messageId: string,
    status: "delivered" | "read" | "failed",
  ): Promise<void>;
  verifyWebhook(mode: string, token: string, challenge: string): string | null;
}

class WhatsappServiceImpl implements WhatsappService {
  private get baseUrl() {
    return `https://graph.facebook.com/v22.0/${env.WHATSAPP_PHONE_NUMBER_ID}`;
  }

  private headers() {
    if (!isWhatsappConfigured()) throw new WhatsappNotConfigured();
    return {
      authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      "content-type": "application/json",
    };
  }

  async sendTemplateMessage(p: SendTemplateParams): Promise<WhatsappSendResult> {
    const res = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: p.to,
        type: "template",
        template: {
          name: p.templateName,
          language: { code: p.languageCode ?? "es" },
          components: p.variables
            ? [
                {
                  type: "body",
                  parameters: p.variables.map((v) => ({ type: "text", text: v })),
                },
              ]
            : undefined,
        },
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Meta API ${res.status}: ${err}`);
    }
    const data = (await res.json()) as { messages?: { id: string }[] };
    return {
      messageId: data.messages?.[0]?.id ?? "",
      status: "queued",
    };
  }

  async sendTextMessage(p: SendTextParams): Promise<WhatsappSendResult> {
    const res = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: p.to,
        type: "text",
        text: { body: p.text },
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Meta API ${res.status}: ${err}`);
    }
    const data = (await res.json()) as { messages?: { id: string }[] };
    return { messageId: data.messages?.[0]?.id ?? "", status: "queued" };
  }

  /**
   * Procesa el body del webhook entrante de Meta.
   * Estructura: { entry: [{ changes: [{ value: { messages: [], statuses: [] } }] }] }
   */
  async handleWebhook(body: unknown): Promise<WhatsappWebhookEvent[]> {
    const events: WhatsappWebhookEvent[] = [];
    const root = body as { entry?: unknown[] };
    if (!root.entry) return events;

    for (const entry of root.entry) {
      const e = entry as { changes?: unknown[] };
      for (const ch of e.changes ?? []) {
        const c = ch as { value?: { messages?: unknown[]; statuses?: unknown[] } };
        for (const m of c.value?.messages ?? []) {
          events.push({ type: "message", payload: m });
        }
        for (const s of c.value?.statuses ?? []) {
          events.push({ type: "status", payload: s });
        }
      }
    }
    return events;
  }

  async updateMessageStatus(): Promise<void> {
    // Persiste el cambio de status en `outbound_messages` o `conversation_messages`.
    // Implementación real requiere repo Supabase.
  }

  /** GET /api/whatsapp/webhook — handshake con Meta. */
  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    if (
      mode === "subscribe" &&
      token === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN &&
      env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
    ) {
      return challenge;
    }
    return null;
  }
}

export const whatsappService: WhatsappService = new WhatsappServiceImpl();
