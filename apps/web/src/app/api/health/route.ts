import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "dermaland-web",
    phase: "0",
    port: 3031,
    timestamp: new Date().toISOString(),
  });
}
