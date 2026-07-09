import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepoContext } from "@/server/auth/context";
import {
  listAudit,
  recordAudit,
  type AuditInput,
} from "@/server/repositories/supabase/commission";
import { notSupabase, fail } from "../_helpers";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const ctx = await getRepoContext();
    const audit = await listAudit(ctx);
    return NextResponse.json({ audit }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const body = (await req.json()) as AuditInput;
    const ctx = await getRepoContext();
    const entry = await recordAudit(ctx, body);
    return NextResponse.json({ entry }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
