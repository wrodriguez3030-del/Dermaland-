import { NextResponse, type NextRequest } from "next/server";
import { requireAiAdmin } from "@/server/services/ai/guard";
import { aiErrorResponse, requireSupabase } from "@/server/services/ai/api-helpers";
import { upsertBinding } from "@/server/services/ai/store";

export const dynamic = "force-dynamic";

/** Asigna proveedor/modelo/fallback/estado a un agente (binding). */
export async function PATCH(
  req: NextRequest, { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = requireSupabase();
  if (gate) return gate;
  try {
    const session = await requireAiAdmin();
    const { id } = await params;
    const body = await req.json();
    const binding = await upsertBinding(session.businessId, id, {
      providerId: body.providerId ?? null,
      model: body.model ?? null,
      fallbackProviderId: body.fallbackProviderId ?? null,
      fallbackModel: body.fallbackModel ?? null,
      status: body.status,
      temperature: body.temperature ?? null,
      reasoningEffort: body.reasoningEffort ?? null,
      maxOutputTokens: body.maxOutputTokens ?? null,
    });
    return NextResponse.json({ binding });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
