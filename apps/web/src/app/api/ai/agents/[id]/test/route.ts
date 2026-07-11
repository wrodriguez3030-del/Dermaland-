import { NextResponse, type NextRequest } from "next/server";
import { requireAiAdmin } from "@/server/services/ai/guard";
import { aiErrorResponse, requireSupabase } from "@/server/services/ai/api-helpers";
import { getBinding } from "@/server/services/ai/store";
import { runRequest, AiServiceError } from "@/server/services/ai/provider-service";
import { mockAIAgents } from "@/lib/mock-data/integrations";

export const dynamic = "force-dynamic";

/**
 * Prueba un agente con un mensaje. MODO DE PRUEBA: se ejecuta SIN herramientas
 * de efecto (no envía WhatsApp ni modifica datos). Solo respuesta del modelo.
 */
export async function POST(
  req: NextRequest, { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = requireSupabase();
  if (gate) return gate;
  try {
    const session = await requireAiAdmin();
    const { id } = await params;
    const agent = mockAIAgents.find((a) => a.id === id);
    if (!agent) return NextResponse.json({ error: "Agente no encontrado." }, { status: 404 });
    const binding = await getBinding(session.businessId, id);
    if (!binding?.providerId || !binding.model) {
      throw new AiServiceError("provider_not_configured", "Configura un proveedor de IA para activar este agente.");
    }
    if (binding.status === "paused") {
      return NextResponse.json({ error: "El agente está pausado." }, { status: 409 });
    }
    const body = await req.json();
    const message = String(body?.message ?? "").trim() || "Hola, ¿puedes presentarte?";
    const result = await runRequest({
      businessId: session.businessId,
      userId: session.user.id,
      branchId: session.branchId,
      agentId: id,
      providerId: binding.providerId,
      model: binding.model,
      instructions: agent.systemPrompt,
      input: message,
      temperature: binding.temperature ?? undefined,
      maxOutputTokens: binding.maxOutputTokens ?? undefined,
      fallback: binding.fallbackProviderId && binding.fallbackModel
        ? { providerId: binding.fallbackProviderId, model: binding.fallbackModel }
        : null,
    });
    return NextResponse.json({
      text: result.text,
      testMode: true,
      usedFallback: result.usedFallback,
      usage: result.usage,
      estimatedCostUsd: result.estimatedCostUsd,
      latencyMs: result.latencyMs,
      status: result.status,
    });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
