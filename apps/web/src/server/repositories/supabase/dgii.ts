import "server-only";
import { createServer } from "@/lib/supabase/server";
import type {
  DgiiRepository,
  DgiiSettings,
  DgiiSettingsPatch,
  RepoContext,
} from "../types";
import type { DgiiSequence, ElectronicInvoice } from "@/types";

/**
 * Implementación Supabase del `DgiiRepository`.
 *
 * Activa cuando `DATA_SOURCE=supabase` y las env vars
 * `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` están
 * presentes. Las consultas filtran por `business_id = ctx.businessId`
 * como defensa en profundidad — RLS ya restringe pero NUNCA confiar solo
 * en RLS (R-SEC-01).
 *
 * Mapeo snake_case (Supabase) ↔ camelCase (TS) inline. Si crecemos, mover
 * a `mappers.ts`.
 *
 * **Pre-requisito:** migraciones 0003 y 0004 aplicadas. Si las tablas no
 * existen, las queries lanzan errores de Postgres ("relation does not
 * exist") — capturados y normalizados como `DgiiRepositoryError`.
 */

export class DgiiRepositoryError extends Error {
  override cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(`DgiiRepository: ${message}`);
    this.name = "DgiiRepositoryError";
    this.cause = cause;
  }
}

/**
 * Cliente Supabase con typing relajado para tablas DGII.
 *
 * `database.types.ts` se mantiene como skeleton manual de Fase 1 y NO
 * incluye las tablas de la migración 0003 (`dgii_settings`,
 * `ecf_sequences`, `electronic_invoices`, etc.) hasta que regeneres con:
 *   pnpm dlx supabase gen types typescript --project-id <id> > src/server/db/database.types.ts
 *
 * Mientras tanto bypasseamos el typing del builder con `any` solo aquí.
 * El runtime no se ve afectado — Supabase no valida tipos contra el cliente.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

async function getClient(): Promise<AnySupabase> {
  const client = await createServer();
  if (!client) {
    throw new DgiiRepositoryError(
      "Supabase no configurado (faltan NEXT_PUBLIC_SUPABASE_URL / ANON_KEY)",
    );
  }
  return client as AnySupabase;
}

function rowToDgiiSettings(row: Record<string, unknown>): DgiiSettings {
  return {
    rncEmisor: String(row.rnc_emisor),
    razonSocialEmisor: String(row.razon_social_emisor),
    nombreComercial: (row.nombre_comercial as string | null) ?? null,
    direccionEmisor: String(row.direccion_emisor),
    municipio: (row.municipio as string | null) ?? null,
    provincia: (row.provincia as string | null) ?? null,
    actividadEconomica: (row.actividad_economica as string | null) ?? null,
    telefonoEmisor: (row.telefono_emisor as string | null) ?? null,
    correoEmisor: (row.correo_emisor as string | null) ?? null,
    website: (row.website as string | null) ?? null,
    ambiente: row.ambiente as "testecf" | "certecf" | "ecf",
    dgiiEnabledRealSend: Boolean(row.dgii_enabled_real_send),
    baseUrlTestecf: String(row.base_url_testecf),
    baseUrlCertecf: String(row.base_url_certecf),
    baseUrlEcf: String(row.base_url_ecf),
    defaultCashClosingEcfPercentage: Number(
      row.default_cash_closing_ecf_percentage,
    ),
    allowUserChangeClosingPercentage: Boolean(
      row.allow_user_change_closing_percentage,
    ),
    minimumClosingEcfPercentage: Number(row.minimum_closing_ecf_percentage),
    maximumClosingEcfPercentage: Number(row.maximum_closing_ecf_percentage),
    requireAdminAuthorizationBelow100Percent: Boolean(
      row.require_admin_authorization_below_100_percent,
    ),
    autoGenerateEcfOnCashClosing: Boolean(row.auto_generate_ecf_on_cash_closing),
    appliesToPaymentMethods: Array.isArray(row.applies_to_payment_methods)
      ? (row.applies_to_payment_methods as string[])
      : [],
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function patchToRow(
  businessId: string,
  patch: DgiiSettingsPatch,
): Record<string, unknown> {
  // Mapeo selectivo. Solo escribe las columnas que vienen en el patch.
  const r: Record<string, unknown> = {
    business_id: businessId,
    updated_at: new Date().toISOString(),
  };
  if (patch.rncEmisor !== undefined) r.rnc_emisor = patch.rncEmisor;
  if (patch.razonSocialEmisor !== undefined)
    r.razon_social_emisor = patch.razonSocialEmisor;
  if (patch.nombreComercial !== undefined)
    r.nombre_comercial = patch.nombreComercial;
  if (patch.direccionEmisor !== undefined)
    r.direccion_emisor = patch.direccionEmisor;
  if (patch.municipio !== undefined) r.municipio = patch.municipio;
  if (patch.provincia !== undefined) r.provincia = patch.provincia;
  if (patch.actividadEconomica !== undefined)
    r.actividad_economica = patch.actividadEconomica;
  if (patch.telefonoEmisor !== undefined)
    r.telefono_emisor = patch.telefonoEmisor;
  if (patch.correoEmisor !== undefined) r.correo_emisor = patch.correoEmisor;
  if (patch.website !== undefined) r.website = patch.website;
  if (patch.ambiente !== undefined) r.ambiente = patch.ambiente;
  if (patch.dgiiEnabledRealSend !== undefined)
    r.dgii_enabled_real_send = patch.dgiiEnabledRealSend;
  if (patch.baseUrlTestecf !== undefined)
    r.base_url_testecf = patch.baseUrlTestecf;
  if (patch.baseUrlCertecf !== undefined)
    r.base_url_certecf = patch.baseUrlCertecf;
  if (patch.baseUrlEcf !== undefined) r.base_url_ecf = patch.baseUrlEcf;
  if (patch.defaultCashClosingEcfPercentage !== undefined)
    r.default_cash_closing_ecf_percentage = patch.defaultCashClosingEcfPercentage;
  if (patch.allowUserChangeClosingPercentage !== undefined)
    r.allow_user_change_closing_percentage = patch.allowUserChangeClosingPercentage;
  if (patch.minimumClosingEcfPercentage !== undefined)
    r.minimum_closing_ecf_percentage = patch.minimumClosingEcfPercentage;
  if (patch.maximumClosingEcfPercentage !== undefined)
    r.maximum_closing_ecf_percentage = patch.maximumClosingEcfPercentage;
  if (patch.requireAdminAuthorizationBelow100Percent !== undefined)
    r.require_admin_authorization_below_100_percent =
      patch.requireAdminAuthorizationBelow100Percent;
  if (patch.autoGenerateEcfOnCashClosing !== undefined)
    r.auto_generate_ecf_on_cash_closing = patch.autoGenerateEcfOnCashClosing;
  if (patch.appliesToPaymentMethods !== undefined)
    r.applies_to_payment_methods = patch.appliesToPaymentMethods;
  return r;
}

function rowToDgiiSequence(row: Record<string, unknown>): DgiiSequence {
  return {
    type: row.tipo_ecf as DgiiSequence["type"],
    label: `Secuencia ${row.tipo_ecf}`,
    rangeStart: Number(row.range_start),
    rangeEnd: Number(row.range_end),
    nextNumber: Number(row.next_number),
    expiresAt: String(row.fecha_vencimiento),
    status:
      row.status === "active"
        ? "active"
        : row.status === "expiring"
          ? "expiring"
          : "exhausted",
  };
}

export const dgiiRepository: DgiiRepository = {
  async sequences(ctx: RepoContext) {
    const sb = await getClient();
    const { data, error } = await sb
      .from("ecf_sequences")
      .select("*")
      .eq("business_id", ctx.businessId)
      .order("created_at", { ascending: true });
    if (error) throw new DgiiRepositoryError("sequences", error);
    return (data ?? []).map(rowToDgiiSequence);
  },

  async invoices(_ctx: RepoContext): Promise<ElectronicInvoice[]> {
    const sb = await getClient();
    const { data, error } = await sb
      .from("electronic_invoices")
      .select("*")
      .eq("business_id", _ctx.businessId)
      .order("created_at", { ascending: false });
    if (error) throw new DgiiRepositoryError("invoices", error);
    return (data ?? []).map(
      (row: Record<string, unknown>) =>
        ({
          id: String(row.id),
          ecfType: row.tipo_ecf as ElectronicInvoice["ecfType"],
          ecfNumber: String(row.e_ncf),
          customerName: String(row.customer_name ?? ""),
          amount: Number(row.subtotal_gravado ?? 0),
          itbis: Number(row.total_itbis ?? 0),
          total: Number(row.total ?? 0),
          status: row.status as ElectronicInvoice["status"],
          trackId: (row.track_id as string | undefined) ?? undefined,
          qrCode: (row.qr_code_payload as string | undefined) ?? undefined,
          createdAt: String(row.created_at),
          submittedAt: (row.sent_at as string | undefined) ?? undefined,
        }) satisfies ElectronicInvoice,
    );
  },

  async settings(ctx: RepoContext) {
    const sb = await getClient();
    const { data, error } = await sb
      .from("dgii_settings")
      .select("*")
      .eq("business_id", ctx.businessId)
      .maybeSingle();
    if (error) throw new DgiiRepositoryError("settings", error);
    return data ? rowToDgiiSettings(data) : null;
  },

  async saveSettings(ctx: RepoContext, patch: DgiiSettingsPatch) {
    const sb = await getClient();
    const row = patchToRow(ctx.businessId, patch);
    const { data, error } = await sb
      .from("dgii_settings")
      .upsert(row, { onConflict: "business_id" })
      .select("*")
      .single();
    if (error) throw new DgiiRepositoryError("saveSettings", error);
    return rowToDgiiSettings(data);
  },
};
