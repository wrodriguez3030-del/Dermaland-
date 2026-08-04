import { NextResponse } from "next/server";
import { z } from "zod";
import { BUSINESS_ADMIN_ROLES } from "@/features/billing/permissions";
import { sessionToRepoContext } from "@/server/auth/context";
import { authorizeRole } from "@/server/auth/require-role";
import { getRepositories } from "@/server/repositories";
import { saveBankAccounts } from "@/server/services/storefront/transfer-payments";

/**
 * Cuentas bancarias a las que el cliente transfiere.
 *
 * Solo ADMIN: un número de cuenta equivocado aquí manda el dinero de los
 * clientes a otro sitio. No es una preferencia de pantalla.
 */

export const dynamic = "force-dynamic";

const CuerpoSchema = z.object({
  accounts: z
    .array(
      z.object({
        bankName: z.string().trim().min(1).max(80),
        accountType: z.enum(["ahorros", "corriente"]),
        // Solo dígitos: un número de cuenta con letras es un error de tecleo.
        accountNumber: z
          .string()
          .transform((v) => v.replace(/\D/g, ""))
          .refine(
            (v) => v.length >= 6 && v.length <= 24,
            "Revisa el número de cuenta.",
          ),
        holderName: z.string().trim().min(1).max(120),
        holderDocument: z.string().trim().max(30).optional(),
        active: z.boolean(),
      }),
    )
    .max(10),
});

export async function POST(request: Request) {
  const auth = await authorizeRole(BUSINESS_ADMIN_ROLES);
  if (!auth.ok) return auth.res;

  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const parseado = CuerpoSchema.safeParse(cuerpo);
  if (!parseado.success) {
    return NextResponse.json(
      { error: parseado.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 422 },
    );
  }

  const ctx = sessionToRepoContext(auth.session);
  const res = await saveBankAccounts(ctx.businessId, parseado.data.accounts);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 422 });

  await getRepositories().audit.log(ctx, {
    businessId: ctx.businessId,
    userId: ctx.userId ?? "",
    userName: ctx.userName ?? "",
    action: "payment.bank_accounts_update",
    entity: "payment_bank_accounts",
    entityId: ctx.businessId,
    // Los NÚMEROS DE CUENTA no van a la auditoría: ese registro lo lee mucha
    // más gente que el panel donde se escriben.
    metadata: { cuentas_guardadas: res.saved, cuentas_activas: res.active },
  });

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
