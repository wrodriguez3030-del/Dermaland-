import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepoContext } from "@/server/auth/context";
import {
  listPayouts,
  setPayouts,
  clearPayouts,
} from "@/server/repositories/supabase/commission";
import type { ManagedPayout } from "@/features/reports/commission/commission-payout-store";
import { notSupabase, fail } from "../_helpers";
import { denyIfNotCommissionAdmin } from "../_helpers";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const ctx = await getRepoContext();
    const payouts = await listPayouts(ctx);
    return NextResponse.json({ payouts }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
    const denied = await denyIfNotCommissionAdmin();
    if (denied) return denied;
  try {
    const body = (await req.json()) as {
      comprobantes: string[];
      status: ManagedPayout;
      userName?: string;
      batchId?: string;
    };
    const ctx = await getRepoContext();
    const payouts = await setPayouts(ctx, body);
    return NextResponse.json({ payouts }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
    const denied = await denyIfNotCommissionAdmin();
    if (denied) return denied;
  try {
    const body = (await req.json().catch(() => ({}))) as { comprobantes?: string[] };
    const ctx = await getRepoContext();
    await clearPayouts(ctx, body.comprobantes ?? []);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
