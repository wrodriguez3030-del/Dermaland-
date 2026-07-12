import { NextResponse, type NextRequest } from "next/server";
import { requireAiAdmin, requireAiUser } from "@/server/services/ai/guard";
import { aiErrorResponse, requireSupabase } from "@/server/services/ai/api-helpers";
import { createProvider, listProviders } from "@/server/services/ai/store";
import { saveProviderKey } from "@/server/services/ai/provider-service";
import { isProviderImplemented } from "@/server/services/ai/providers/factory";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const gate = requireSupabase();
  if (gate) return gate;
  try {
    const session = await requireAiUser();
    const providers = await listProviders(session.businessId);
    return NextResponse.json({ providers }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return aiErrorResponse(e);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = requireSupabase();
  if (gate) return gate;
  try {
    const session = await requireAiAdmin();
    const body = await req.json();
    if (!body?.providerType || !body?.displayName) {
      return NextResponse.json({ error: "Faltan datos: proveedor y nombre." }, { status: 400 });
    }
    if (!isProviderImplemented(body.providerType)) {
      return NextResponse.json(
        { error: "Ese proveedor todavía no está disponible." },
        { status: 400 },
      );
    }
    // Org/Project SOLO con formato real de OpenAI; texto libre (p. ej. el
    // nombre de la empresa) se descarta — rompería todas las solicitudes.
    const orgId = typeof body.organizationId === "string" && body.organizationId.startsWith("org-")
      ? body.organizationId : null;
    const projId = typeof body.projectId === "string" && body.projectId.startsWith("proj_")
      ? body.projectId : null;
    const provider = await createProvider(session.businessId, session.user.id, {
      providerType: body.providerType,
      displayName: String(body.displayName),
      baseUrl: body.baseUrl ?? null,
      organizationId: orgId,
      projectId: projId,
      defaultModel: body.defaultModel ?? null,
      economicalModel: body.economicalModel ?? null,
      reasoningModel: body.reasoningModel ?? null,
      fallbackModel: body.fallbackModel ?? null,
      monthlyRequestLimit: body.monthlyRequestLimit ?? null,
      monthlyBudgetUsd: body.monthlyBudgetUsd ?? null,
      maxOutputTokens: body.maxOutputTokens ?? null,
      maxToolCalls: body.maxToolCalls ?? null,
      timeoutMs: body.timeoutMs ?? null,
      streamingEnabled: body.streamingEnabled ?? true,
      storeResponses: body.storeResponses ?? false,
    });
    // La API key (si viene) se cifra y guarda aparte; NUNCA se devuelve.
    if (body.apiKey) {
      await saveProviderKey(session.businessId, provider.id, String(body.apiKey));
    }
    return NextResponse.json({ provider }, { status: 201 });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
