import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";
import type { PaymentMethod } from "@/features/purchases/compras-store";

export const dynamic = "force-dynamic";

function notSupabase() {
  return NextResponse.json(
    { error: "Backend de compras en modo local (DATA_SOURCE=mock)." },
    { status: 409 },
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const { id } = await params;
    const body = (await req.json()) as { amount: number; method?: PaymentMethod };
    if (!(body.amount > 0)) {
      return NextResponse.json({ error: "El monto debe ser mayor a 0." }, { status: 422 });
    }
    const ctx = await getRepoContext();
    const invoice = await getRepositories().supplierInvoice.registerPayment(
      ctx,
      id,
      body.amount,
      body.method ?? "transferencia",
    );
    return NextResponse.json({ invoice });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
