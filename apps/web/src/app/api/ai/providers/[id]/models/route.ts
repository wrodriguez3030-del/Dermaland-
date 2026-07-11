import { NextResponse, type NextRequest } from "next/server";
import { requireAiUser } from "@/server/services/ai/guard";
import { aiErrorResponse, requireSupabase } from "@/server/services/ai/api-helpers";
import { listProviderModels } from "@/server/services/ai/provider-service";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest, { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = requireSupabase();
  if (gate) return gate;
  try {
    const session = await requireAiUser();
    const { id } = await params;
    const models = await listProviderModels(session.businessId, id);
    return NextResponse.json({ models }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
