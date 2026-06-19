import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";

export const dynamic = "force-dynamic";

function notSupabase() {
  return NextResponse.json(
    { error: "Backend de categorías de gasto en modo local (DATA_SOURCE=mock)." },
    { status: 409 },
  );
}

export async function GET(_req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const ctx = await getRepoContext();
    const categories = await getRepositories().expenseCategory.list(ctx);
    return NextResponse.json({ categories }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const body = (await req.json()) as { name: string };
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "El nombre de la categoría es obligatorio." }, { status: 422 });
    }
    const ctx = await getRepoContext();
    const category = await getRepositories().expenseCategory.create(ctx, body);
    return NextResponse.json({ category }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
