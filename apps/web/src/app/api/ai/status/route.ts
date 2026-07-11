import { NextResponse } from "next/server";
import { isAiCredentialsEncryptionConfigured } from "@/lib/env";
import { requireAiUser } from "@/server/services/ai/guard";
import { aiErrorResponse, requireSupabase } from "@/server/services/ai/api-helpers";
import { listProviders, listBindings } from "@/server/services/ai/store";
import { mockAIAgents } from "@/lib/mock-data/integrations";

export const dynamic = "force-dynamic";

/**
 * Estado de configuración del módulo IA para la guía de "primeros pasos".
 * SOLO booleans/conteos — nunca credenciales ni detalles internos.
 */
export async function GET(): Promise<NextResponse> {
  const gate = requireSupabase();
  if (gate) return gate;
  try {
    const session = await requireAiUser();
    const [providers, bindings] = await Promise.all([
      listProviders(session.businessId),
      listBindings(session.businessId),
    ]);
    const connected = providers.filter((p) => p.status === "connected");
    const boundAgents = bindings.filter((b) => b.providerId && b.model).length;
    return NextResponse.json(
      {
        status: {
          encryptionConfigured: isAiCredentialsEncryptionConfigured(),
          providersTotal: providers.length,
          providersConnected: connected.length,
          agentsTotal: mockAIAgents.length,
          agentsConfigured: boundAgents,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return aiErrorResponse(e);
  }
}
