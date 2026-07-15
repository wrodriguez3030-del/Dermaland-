/**
 * Catálogo de tools del agente IA de DermaLand.
 *
 * **Regla dura del proyecto: prohibido cualquier tool de agendamiento.**
 * Si alguna vez intentas registrar `create_booking`, `available_slots`,
 * `reschedule_booking`, `cancel_booking`, `confirm_booking` aquí, la
 * función `validateToolName()` lanza un error sincrónico y los tests
 * de CI fallan.
 *
 * Spec §20 y §21 prohíben estas operaciones.
 */

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Tools permitidas para los agentes IA de DermaLand. */
export const ALLOWED_TOOLS: Tool[] = [
  {
    name: "get_client",
    description: "Obtiene el perfil de un cliente por ID, cédula o teléfono.",
    parameters: {
      type: "object",
      properties: {
        identifier: { type: "string" },
        kind: { type: "string", enum: ["id", "phone", "document"] },
      },
      required: ["identifier"],
    },
  },
  {
    name: "search_products",
    description: "Busca productos del catálogo por nombre o SKU.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 25 },
      },
      required: ["query"],
    },
  },
  {
    name: "get_inventory_stock",
    description: "Stock disponible para un producto en una sucursal.",
    parameters: {
      type: "object",
      properties: {
        product_id: { type: "string" },
        branch_id: { type: "string" },
      },
      required: ["product_id"],
    },
  },
  {
    name: "get_product_lots",
    description: "Lotes de un producto con su vencimiento y cantidad.",
    parameters: {
      type: "object",
      properties: { product_id: { type: "string" } },
      required: ["product_id"],
    },
  },
  {
    name: "get_expiring_lots",
    description: "Lotes próximos a vencer en N días (default 30).",
    parameters: {
      type: "object",
      properties: { days: { type: "integer", minimum: 1, maximum: 365 } },
    },
  },
  {
    name: "get_sales_summary",
    description: "Resumen de ventas por período/sucursal/cajero.",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", format: "date" },
        to: { type: "string", format: "date" },
        branch_id: { type: "string" },
      },
    },
  },
  {
    name: "get_receivables",
    description:
      "Cuentas por cobrar (ventas a crédito): total pendiente, clientes que más deben, facturas que vencen hoy, vencidas +60 días, cobrado esta semana, saldo por vendedor e índice de recuperación.",
    parameters: {
      type: "object",
      properties: {
        view: {
          type: "string",
          enum: [
            "summary",
            "top_debtors",
            "due_today",
            "overdue_60",
            "collected_week",
            "by_seller",
          ],
        },
      },
      required: ["view"],
    },
  },
  {
    name: "get_inventory_count_differences",
    description: "Diferencias de un conteo físico aprobado.",
    parameters: {
      type: "object",
      properties: { count_id: { type: "string" } },
      required: ["count_id"],
    },
  },
  {
    name: "send_whatsapp_message",
    description: "Envía un mensaje de plantilla aprobada via WhatsApp.",
    parameters: {
      type: "object",
      properties: {
        phone: { type: "string" },
        template_name: { type: "string" },
        variables: { type: "array", items: { type: "string" } },
      },
      required: ["phone", "template_name"],
    },
  },
  {
    name: "handoff_to_human",
    description:
      "Transfiere la conversación a un operador humano. Usar cuando el usuario pide hablar con alguien o se detecta caso fuera de scope.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string" },
        priority: { type: "string", enum: ["low", "normal", "high"] },
      },
      required: ["reason"],
    },
  },
];

/**
 * Tools EXPLÍCITAMENTE PROHIBIDAS — agendamiento.
 *
 * Si en algún rebase futuro un dev olvida la regla y agrega una de estas,
 * `validateToolName()` lanza error y CI falla. Defensa en profundidad.
 */
export const FORBIDDEN_TOOLS = new Set([
  "create_booking",
  "create_appointment",
  "schedule_appointment",
  "reschedule_booking",
  "reschedule_appointment",
  "cancel_booking",
  "cancel_appointment",
  "confirm_booking",
  "confirm_appointment",
  "available_slots",
  "list_available_slots",
  "list_appointments",
  "get_calendar",
  "find_open_slot",
  "no_show",
  "waitlist_add",
]);

/**
 * Lanza si la tool está prohibida o no está registrada en `ALLOWED_TOOLS`.
 * Llamar SIEMPRE antes de invocar el LLM con una lista de tools.
 *
 * Spec §20: "Prohibido: crear/reprogramar/cancelar/confirmar citas · consultar
 * horarios disponibles."
 */
export function validateToolName(toolName: string): void {
  if (FORBIDDEN_TOOLS.has(toolName)) {
    throw new Error(
      `Tool prohibida: "${toolName}". DermaLand NO maneja agendamiento. ` +
        `Ver SPEC §20 y riesgos.md → R-AI-01.`,
    );
  }
  const allowed = ALLOWED_TOOLS.some((t) => t.name === toolName);
  if (!allowed) {
    throw new Error(
      `Tool no registrada: "${toolName}". Registrar en ALLOWED_TOOLS o usar handoff_to_human.`,
    );
  }
}

/**
 * Valida el conjunto completo de tools que se le pasarán al LLM en `tools=[...]`
 * antes de la llamada. Bloquea bulk si alguna prohibida está incluida.
 */
export function validateToolSet(tools: { name: string }[]): void {
  for (const t of tools) {
    validateToolName(t.name);
  }
}
