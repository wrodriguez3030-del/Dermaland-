import { NextResponse, type NextRequest } from "next/server";
import { requireAiUser } from "@/server/services/ai/guard";
import { aiErrorResponse, requireSupabase } from "@/server/services/ai/api-helpers";
import { getBinding } from "@/server/services/ai/store";
import {
  runRequest,
  resolveAgentTarget,
} from "@/server/services/ai/provider-service";
import { mockAIAgents } from "@/lib/mock-data/integrations";
import type { AIChatMessage } from "@/server/services/ai/providers/types";

export const dynamic = "force-dynamic";

const MAX_HISTORY = 20; // últimos turnos que se envían al modelo
const MAX_MESSAGE_CHARS = 4000;

/**
 * Chat conversacional con un agente (multi-turno). El historial viaja del
 * cliente y se recorta/valida aquí; el system prompt del agente NUNCA viene del
 * cliente. Sin tools de efecto por este canal (solo conversación).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = requireSupabase();
  if (gate) return gate;
  try {
    const session = await requireAiUser();
    const body = await req.json();
    const agentId = String(body?.agentId ?? "");
    const agent = mockAIAgents.find((a) => a.id === agentId);
    if (!agent) return NextResponse.json({ error: "Agente no encontrado." }, { status: 404 });

    const binding = await getBinding(session.businessId, agentId);
    if (binding?.status === "paused") {
      return NextResponse.json(
        { error: "El agente está pausado. Actívalo en Agentes IA." },
        { status: 409 },
      );
    }
    const target = await resolveAgentTarget(session.businessId, {
      providerId: binding?.providerId ?? null,
      model: binding?.model ?? null,
    });

    // Validar/recortar historial: solo roles user/assistant, textos acotados.
    const raw = Array.isArray(body?.messages) ? body.messages : [];
    const messages: AIChatMessage[] = raw
      .filter((m: unknown): m is { role: string; content: string } =>
        !!m && typeof m === "object" &&
        ((m as { role?: unknown }).role === "user" || (m as { role?: unknown }).role === "assistant") &&
        typeof (m as { content?: unknown }).content === "string")
      .slice(-MAX_HISTORY)
      .map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content.slice(0, MAX_MESSAGE_CHARS),
      }));
    if (messages.length === 0 || messages[messages.length - 1]!.role !== "user") {
      return NextResponse.json({ error: "Escribe un mensaje." }, { status: 400 });
    }

    const result = await runRequest({
      businessId: session.businessId,
      userId: session.user.id,
      branchId: session.branchId,
      agentId,
      providerId: target.providerId,
      model: target.model,
      instructions: agent.systemPrompt,
      input: messages,
      conversationId: typeof body?.conversationId === "string" ? body.conversationId.slice(0, 64) : undefined,
      channel: "chat",
      temperature: binding?.temperature ?? undefined,
      maxOutputTokens: binding?.maxOutputTokens ?? undefined,
      fallback: binding?.fallbackProviderId && binding.fallbackModel
        ? { providerId: binding.fallbackProviderId, model: binding.fallbackModel }
        : null,
    });

    return NextResponse.json({
      text: result.text,
      model: result.model,
      usedFallback: result.usedFallback,
      usage: result.usage,
      estimatedCostUsd: result.estimatedCostUsd,
      latencyMs: result.latencyMs,
    });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
