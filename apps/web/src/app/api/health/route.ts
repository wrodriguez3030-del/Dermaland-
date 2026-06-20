import { NextResponse } from "next/server";
import {
  isDgiiConfigured,
  isOpenAIConfigured,
  isSupabaseConfigured,
  isWhatsappConfigured,
  env,
} from "@/lib/env";

export async function GET() {
  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV,
    build: process.env.APP_BUILD_SHA ?? "dev",
    data_source: env.DATA_SOURCE,
    integrations: {
      supabase: isSupabaseConfigured(),
      dgii: isDgiiConfigured(),
      whatsapp: isWhatsappConfigured(),
      openai: isOpenAIConfigured(),
    },
  });
}
