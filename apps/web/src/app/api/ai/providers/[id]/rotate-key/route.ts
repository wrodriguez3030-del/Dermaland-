import { NextResponse, type NextRequest } from "next/server";
import { requireAiAdmin } from "@/server/services/ai/guard";
import { aiErrorResponse, requireSupabase } from "@/server/services/ai/api-helpers";
import { getProvider } from "@/server/services/ai/store";
import { saveProviderKey } from "@/server/services/ai/provider-service";

export const dynamic = "force-dynamic";

/** Rota (o setea) la API key del proveedor. Cifra y guarda; NUNCA la devuelve. */
export async function POST(
  req: NextRequest, { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = requireSupabase();
  if (gate) return gate;
  try {
    const session = await requireAiAdmin();
    const { id } = await params;
    const provider = await getProvider(session.businessId, id);
    if (!provider) return NextResponse.json({ error: "Proveedor no encontrado." }, { status: 404 });
    const body = await req.json();
    const apiKey = String(body?.apiKey ?? "").trim();
    if (!apiKey) return NextResponse.json({ error: "Ingresa la API key." }, { status: 400 });
    await saveProviderKey(session.businessId, id, apiKey);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
