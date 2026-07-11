import { NextResponse, type NextRequest } from "next/server";
import { requireAiAdmin, requireAiUser } from "@/server/services/ai/guard";
import { aiErrorResponse, requireSupabase } from "@/server/services/ai/api-helpers";
import { getProvider, updateProvider, softDeleteProvider } from "@/server/services/ai/store";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest, { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = requireSupabase();
  if (gate) return gate;
  try {
    const session = await requireAiUser();
    const { id } = await params;
    const provider = await getProvider(session.businessId, id);
    if (!provider) return NextResponse.json({ error: "Proveedor no encontrado." }, { status: 404 });
    return NextResponse.json({ provider }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return aiErrorResponse(e);
  }
}

export async function PATCH(
  req: NextRequest, { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = requireSupabase();
  if (gate) return gate;
  try {
    const session = await requireAiAdmin();
    const { id } = await params;
    const body = await req.json();
    // Nunca se acepta apiKey aquí: la rotación de clave va por /rotate-key.
    delete body.apiKey;
    const provider = await updateProvider(session.businessId, id, body);
    return NextResponse.json({ provider });
  } catch (e) {
    return aiErrorResponse(e);
  }
}

export async function DELETE(
  _req: NextRequest, { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = requireSupabase();
  if (gate) return gate;
  try {
    const session = await requireAiAdmin();
    const { id } = await params;
    await softDeleteProvider(session.businessId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
