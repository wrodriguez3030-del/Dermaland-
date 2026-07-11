import { NextResponse, type NextRequest } from "next/server";
import { requireAiAdmin } from "@/server/services/ai/guard";
import { aiErrorResponse, requireSupabase } from "@/server/services/ai/api-helpers";
import { testProvider } from "@/server/services/ai/provider-service";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest, { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = requireSupabase();
  if (gate) return gate;
  try {
    const session = await requireAiAdmin();
    const { id } = await params;
    const result = await testProvider(session.businessId, id);
    return NextResponse.json({ result });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
