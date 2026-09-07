import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { getRepoContext } from "@/server/auth/context";
import { authorizeRole } from "@/server/auth/require-role";
import { getClient, toUserFacingMessage } from "@/server/repositories/supabase/client";
import { BUSINESS_ADMIN_ROLES } from "@/features/billing/permissions";

export const dynamic = "force-dynamic";

/**
 * Configuración de facturación del negocio.
 *
 * 🔴 Existe porque la configuración se guardaba en `localStorage`: vivía en un
 * solo navegador, el servidor no se enteraba, y desde otra computadora volvía a
 * los valores por defecto sin avisar. Ahora la fuente de verdad es la tabla
 * `billing_settings`, con RLS por negocio.
 *
 * Leer: cualquiera con sesión — el punto de venta necesita saber qué emitir.
 * Escribir: solo administradores, igual que la pantalla (`canEditBillingSettings`).
 * La guarda del servidor no es un adorno: esconder el formulario no impide que
 * alguien llame a la API.
 */

/** Lo que se puede cambiar. `businessId` NO: sale del JWT, nunca del cuerpo. */
const patchSchema = z
  .object({
    defaultBillingMode: z.enum(["ncf", "ecf", "both"]),
    defaultCustomerBillingType: z.enum(["consumo", "credito_fiscal"]),
    usageMode: z.enum(["manual", "automatic"]),
    ecfEnvironment: z.enum(["mock", "demo", "testecf", "certecf", "produccion"]),
    realEmissionEnabled: z.boolean(),
    cardEcfImmediateEnabled: z.boolean(),
    cashTransferEcfClosingEnabled: z.boolean(),
    cashTransferEcfPercentage: z.number().int().min(0).max(100),
    cashTransferSelectionStrategy: z.enum(["last", "first", "manual"]),
    defaultConsumerEcfType: z.literal("E32"),
    defaultRncEcfType: z.literal("E31"),
  })
  .partial();

/** Fila de la tabla → la forma que usa la aplicación. */
function aSettings(row: Record<string, unknown>) {
  return {
    businessId: String(row.business_id),
    defaultBillingMode: row.default_billing_mode,
    defaultCustomerBillingType: row.default_customer_billing_type,
    usageMode: row.usage_mode,
    ecfEnvironment: row.ecf_environment,
    realEmissionEnabled: Boolean(row.real_emission_enabled),
    cardEcfImmediateEnabled: Boolean(row.card_ecf_immediate_enabled),
    cashTransferEcfClosingEnabled: Boolean(row.cash_transfer_ecf_closing_enabled),
    cashTransferEcfPercentage: Number(row.cash_transfer_ecf_percentage),
    cashTransferSelectionStrategy: row.cash_transfer_selection_strategy,
    defaultConsumerEcfType: row.default_consumer_ecf_type,
    defaultRncEcfType: row.default_rnc_ecf_type,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function GET(): Promise<NextResponse> {
  // Sin Supabase, la pantalla se queda con sus valores por defecto locales.
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json({ settings: null }, { headers: { "Cache-Control": "no-store" } });
  }
  try {
    const ctx = await getRepoContext();
    const sb = await getClient("billingSettings.get");
    const { data, error } = await sb
      .from("billing_settings")
      .select("*")
      .eq("business_id", ctx.businessId)
      .maybeSingle();
    if (error) throw error;
    // Sin fila todavía: la pantalla usa sus defaults y la primera escritura la
    // crea. Devolver `null` es más honesto que inventar una fila que no existe.
    return NextResponse.json(
      { settings: data ? aSettings(data) : null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudo cargar la configuración de facturación.") },
      { status: 400 },
    );
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") {
    return NextResponse.json(
      { error: "Sin Supabase la configuración no se puede guardar en el servidor." },
      { status: 409 },
    );
  }
  const auth = await authorizeRole(BUSINESS_ADMIN_ROLES);
  if (!auth.ok) return auth.res;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Configuración inválida." }, { status: 400 });
  }
  const p = parsed.data;

  try {
    const ctx = await getRepoContext();
    const sb = await getClient("billingSettings.patch");

    const { data: actual } = await sb
      .from("billing_settings")
      .select("*")
      .eq("business_id", ctx.businessId)
      .maybeSingle();

    const ambiente = p.ecfEnvironment ?? actual?.ecf_environment ?? "mock";
    const emisionPedida = p.realEmissionEnabled ?? actual?.real_emission_enabled ?? false;
    // 🔴 Killswitch. La base ya lo impide con un CHECK, pero rechazarlo aquí da
    // un motivo legible en vez de un error de restricción, y deja claro que la
    // regla es de negocio y no un detalle del esquema.
    if (emisionPedida && ambiente !== "produccion") {
      return NextResponse.json(
        {
          error:
            "La emisión real solo puede activarse en ambiente producción, con certificado y rango autorizados por la DGII.",
        },
        { status: 400 },
      );
    }

    const fila = {
      business_id: ctx.businessId,
      ...(p.defaultBillingMode !== undefined && { default_billing_mode: p.defaultBillingMode }),
      ...(p.defaultCustomerBillingType !== undefined && {
        default_customer_billing_type: p.defaultCustomerBillingType,
      }),
      ...(p.usageMode !== undefined && { usage_mode: p.usageMode }),
      ...(p.ecfEnvironment !== undefined && { ecf_environment: p.ecfEnvironment }),
      ...(p.realEmissionEnabled !== undefined && { real_emission_enabled: p.realEmissionEnabled }),
      ...(p.cardEcfImmediateEnabled !== undefined && {
        card_ecf_immediate_enabled: p.cardEcfImmediateEnabled,
      }),
      ...(p.cashTransferEcfClosingEnabled !== undefined && {
        cash_transfer_ecf_closing_enabled: p.cashTransferEcfClosingEnabled,
      }),
      ...(p.cashTransferEcfPercentage !== undefined && {
        cash_transfer_ecf_percentage: p.cashTransferEcfPercentage,
      }),
      ...(p.cashTransferSelectionStrategy !== undefined && {
        cash_transfer_selection_strategy: p.cashTransferSelectionStrategy,
      }),
      ...(p.defaultConsumerEcfType !== undefined && {
        default_consumer_ecf_type: p.defaultConsumerEcfType,
      }),
      ...(p.defaultRncEcfType !== undefined && { default_rnc_ecf_type: p.defaultRncEcfType }),
      updated_at: new Date().toISOString(),
    };

    // `merge-duplicates` solo pisa las columnas que van en el cuerpo: un patch
    // parcial no borra lo que no menciona.
    const { data, error } = await sb
      .from("billing_settings")
      .upsert(fila, { onConflict: "business_id" })
      .select("*")
      .single();
    if (error) throw error;

    return NextResponse.json(
      { settings: aSettings(data) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: toUserFacingMessage(e, "No se pudo guardar la configuración de facturación.") },
      { status: 400 },
    );
  }
}
