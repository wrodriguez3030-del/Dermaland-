import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";

export const dynamic = "force-dynamic";

function notSupabase() {
  return NextResponse.json(
    { error: "Backend de gastos en modo local (DATA_SOURCE=mock)." },
    { status: 409 },
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const pettyParam = req.nextUrl.searchParams.get("petty");
    const petty = pettyParam === null ? undefined : pettyParam === "true";
    const branchId = req.nextUrl.searchParams.get("branchId") ?? undefined;
    const ctx = await getRepoContext();
    const expenses = await getRepositories().expense.list(ctx, { petty, branchId });
    return NextResponse.json({ expenses }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const body = await req.json();
    const ctx = await getRepoContext();
    const expense = await getRepositories().expense.create(ctx, body);
    return NextResponse.json({ expense }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
