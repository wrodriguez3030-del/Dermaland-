import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3031"),
  APP_URL: z.string().url().default("http://localhost:3031"),
  DATA_SOURCE: z.enum(["mock", "supabase"]).default("mock"),

  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  DATABASE_URL: z.string().optional(),

  JWT_SECRET: z.string().optional(),
  SESSION_COOKIE_NAME: z.string().default("dermaland-session"),

  DGII_ENVIRONMENT: z.enum(["cert", "prod"]).default("cert"),
  DGII_CERTIFICATE_PATH: z.string().optional(),
  DGII_CERTIFICATE_PASSWORD: z.string().optional(),

  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_DEFAULT_MODEL: z.string().default("gpt-4o-mini"),
});

export type Env = z.infer<typeof schema>;

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Allow boot in dev with missing optional vars; only crash on hard misconfig
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Invalid environment configuration: " + JSON.stringify(parsed.error.issues),
    );
  }
}

export const env: Env = parsed.success
  ? parsed.data
  : ({
      NODE_ENV: "development",
      NEXT_PUBLIC_APP_URL: "http://localhost:3031",
      APP_URL: "http://localhost:3031",
      DATA_SOURCE: "mock",
      SESSION_COOKIE_NAME: "dermaland-session",
      DGII_ENVIRONMENT: "cert",
      OPENAI_DEFAULT_MODEL: "gpt-4o-mini",
    } as Env);

export function isSupabaseConfigured(): boolean {
  return Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function isDgiiConfigured(): boolean {
  return Boolean(env.DGII_CERTIFICATE_PATH && env.DGII_CERTIFICATE_PASSWORD);
}

export function isWhatsappConfigured(): boolean {
  return Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
}

export function isOpenAIConfigured(): boolean {
  return Boolean(env.OPENAI_API_KEY);
}
