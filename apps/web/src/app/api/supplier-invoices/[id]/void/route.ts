import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";

export const dynamic = "force-dynamic";

function notSupabase() {
  return NextResponse.json(
    { error: "Backend de compras en modo local (DATA_SOURCE=mock)." },
    { status: 409 },
  );
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const { id } = await params;
    const ctx = await getRepoContext();
    const invoice = await getRepositories().supplierInvoice.void(ctx, id);
    return NextResponse.json({ invoice });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
