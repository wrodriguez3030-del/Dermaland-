import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepoContext } from "@/server/auth/context";
import {
  listExclusions,
  upsertExclusion,
  deleteExclusion,
} from "@/server/repositories/supabase/commission";
import { notSupabase, fail } from "../_helpers";
import { denyIfNotCommissionAdmin } from "../_helpers";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const ctx = await getRepoContext();
    const exclusions = await listExclusions(ctx);
    return NextResponse.json({ exclusions }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
    const denied = await denyIfNotCommissionAdmin();
    if (denied) return denied;
  try {
    const body = (await req.json()) as { comprobante: string; reason: string; userName?: string };
    const ctx = await getRepoContext();
    const exclusion = await upsertExclusion(ctx, body);
    return NextResponse.json({ exclusion }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
    const denied = await denyIfNotCommissionAdmin();
    if (denied) return denied;
  try {
    const comprobante = req.nextUrl.searchParams.get("comprobante");
    if (!comprobante) return fail(new Error("Falta el comprobante."), "Falta el comprobante.");
    const ctx = await getRepoContext();
    await deleteExclusion(ctx, comprobante);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
