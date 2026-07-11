import { NextResponse } from "next/server";
import { requireAiUser } from "@/server/services/ai/guard";
import { aiErrorResponse, requireSupabase } from "@/server/services/ai/api-helpers";
import { listBindings } from "@/server/services/ai/store";
import { mockAIAgents } from "@/lib/mock-data/integrations";

export const dynamic = "force-dynamic";

/** Agentes (catálogo) + su binding de proveedor/modelo (si existe). */
export async function GET(): Promise<NextResponse> {
  const gate = requireSupabase();
  if (gate) return gate;
  try {
    const session = await requireAiUser();
    const bindings = await listBindings(session.businessId);
    const byAgent = new Map(bindings.map((b) => [b.agentId, b]));
    const agents = mockAIAgents.map((a) => ({
      id: a.id,
      name: a.name,
      systemPrompt: a.systemPrompt,
      toolsAllowed: a.toolsAllowed,
      active: a.active,
      binding: byAgent.get(a.id) ?? null,
    }));
    return NextResponse.json({ agents }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
