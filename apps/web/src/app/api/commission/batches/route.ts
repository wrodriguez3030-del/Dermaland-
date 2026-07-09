import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepoContext } from "@/server/auth/context";
import {
  listBatches,
  createBatch,
  type BatchInput,
} from "@/server/repositories/supabase/commission";
import { notSupabase, fail } from "../_helpers";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const ctx = await getRepoContext();
    const batches = await listBatches(ctx);
    return NextResponse.json({ batches }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const body = (await req.json()) as BatchInput;
    const ctx = await getRepoContext();
    const batch = await createBatch(ctx, body);
    return NextResponse.json({ batch }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
