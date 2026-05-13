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
    data_source: env.DATA_SOURCE,
    integrations: {
      supabase: isSupabaseConfigured(),
      dgii: isDgiiConfigured(),
      whatsapp: isWhatsappConfigured(),
      openai: isOpenAIConfigured(),
    },
  });
}
