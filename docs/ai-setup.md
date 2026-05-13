# DermaLand · Setup IA (OpenAI / Anthropic)

Activación del agente conversacional con bloqueo duro de agendamiento.

## Regla dura del proyecto

> **DermaLand NO maneja agendamiento.** Ninguna tool del agente puede crear,
> modificar, cancelar, confirmar citas ni consultar horarios disponibles.

Defensa en 4 capas (todas activas a la vez):

1. **Catálogo de tools** (`src/server/services/ai/tools.ts`) — `ALLOWED_TOOLS`
   no contiene tools de agenda.
2. **`FORBIDDEN_TOOLS`** — set explícito con keywords prohibidos.
3. **`validateToolName()`** — se llama antes de pasar tools al LLM y antes de
   ejecutar cada tool call retornado por el modelo.
4. **System prompt** — instruye explícitamente al LLM a responder
   "no realizamos agendamientos" si el usuario lo pide.
5. **Tests automáticos** (`tools.test.ts`) — CI bloquea merge si alguna
   tool prohibida pasa por accidente.

Riesgo de referencia: `riesgos.md → R-AI-01`.

## Pre-requisitos

- Cuenta **OpenAI Platform** con billing activado.
- API key con scope mínimo: `chat.completions`. Generar en
  https://platform.openai.com/api-keys.

Anthropic como secondary opcional para evaluación comparativa de calidad
y costo. No requerido para MVP.

## Configuración

```
OPENAI_API_KEY=sk-...
OPENAI_DEFAULT_MODEL=gpt-4o-mini   # default rápido y barato
OPENAI_FALLBACK_MODEL=gpt-4o       # fallback para queries complejas
ANTHROPIC_API_KEY=sk-ant-...       # opcional
```

## Tools registradas (Fase 7)

| Tool | Descripción | Requiere repo |
|---|---|---|
| `get_client` | Perfil del cliente por ID/cédula/teléfono | customer |
| `search_products` | Búsqueda en catálogo | product |
| `get_inventory_stock` | Stock por producto/sucursal | productLot |
| `get_product_lots` | Lotes con vencimientos | productLot |
| `get_expiring_lots` | Lotes próximos a vencer | productLot |
| `get_sales_summary` | Ventas por período | proforma |
| `get_inventory_count_differences` | Diferencias de un conteo aprobado | inventoryCount |
| `send_whatsapp_message` | Enviar plantilla aprobada | whatsappService |
| `handoff_to_human` | Derivar a operador humano | — |

Tools prohibidas (cualquier intento de agregar lanza error):

```
create_booking · create_appointment · schedule_appointment
reschedule_booking · reschedule_appointment
cancel_booking · cancel_appointment
confirm_booking · confirm_appointment
available_slots · list_available_slots
list_appointments · get_calendar
find_open_slot · no_show · waitlist_add
```

## Flujo de una llamada

```ts
import { aiService } from "@/server/services/ai/service";

const result = await aiService.complete([
  { role: "user", content: "qué productos para piel sensible tienes?" },
]);

// result.toolCalls — el modelo decidió llamar tools (validadas)
for (const call of result.toolCalls) {
  const data = await aiService.callTool(call.name, call.arguments);
  // ... pasar el resultado de vuelta al modelo
}
```

## Counters y alertas

Cada llamada incrementa `ai_usage_counters` con `model`, `tokens`, `cost_usd`.

Plan **Premium IA** permite 5,000 llamadas/mes. Alertas:
- 80% → admin del business.
- 95% → notificación destacada.
- 100% → bloqueo del módulo (NO bloquea POS).

## Tests obligatorios antes de prod

- [ ] Vitest pasa los 16 tests de `tools.test.ts`.
- [ ] E2E: enviar "agéndame una cita para mañana" al agente → respuesta
      "no realizamos agendamientos" sin tool call.
- [ ] E2E: enviar "qué productos vencen este mes" → ejecuta `get_expiring_lots`.
- [ ] Logs en `ai_action_logs` con duración y costo correctos.

## Anti-jailbreak

Validación adicional en `aiService.complete()`: antes de retornar al caller,
itera sobre `toolCalls` y llama `validateToolName(name)` aunque el LLM
hubiera podido inventar nombres. Si ese camino disparara una excepción,
el response se descarta y se loguea como intent malicioso para review.

## Costo estimado

- `gpt-4o-mini`: ~$0.15/1M input + $0.60/1M output tokens.
- Conversación típica (10 turns): ~$0.005.
- 5,000 conversaciones/mes en plan Premium IA: ~$25/mes.

Anthropic Haiku 4.5 como alternativa si el cliente prefiere por privacidad.
