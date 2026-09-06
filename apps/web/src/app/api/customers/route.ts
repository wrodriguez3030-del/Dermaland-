import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";
import { authorizeRole } from "@/server/auth/require-role";
import { CUSTOMER_MANAGE_ROLES } from "@/features/billing/permissions";

// DL-21: guard de forma mínimo (no rechaza entradas válidas del formulario; el
// repo ya hace whitelisting de columnas y fuerza business_id). Valida lo
// imprescindible y deja pasar el resto de campos conocidos.
const createCustomerSchema = z
  .object({
    firstName: z.string().trim().min(1, "El nombre es obligatorio."),
    lastName: z.string().trim().min(1, "El apellido es obligatorio."),
  })
  .passthrough();

/**
 * Clientes — fuente de verdad del servidor (single source) cuando
 * DATA_SOURCE=supabase. RLS por business_id vía el contexto del JWT.
 *
 * En modo `mock` la UI usa el store local (customer-store); estas rutas
 * quedan disponibles para cuando se conecte Supabase. `no-store` para no
 * congelar datos en caché.
 */
export const dynamic = "force-dynamic";

/**
 * Tope de filas que esta ruta puede devolver — ver el porqué del número
 * junto a `TOPE_CLIENTES` en `server/repositories/supabase/customer.ts`
 * (esa es la fuente real: aquí solo se decide el "pedido" por defecto y se
 * clampa lo que venga por `?limit=`). Sin este tope, `useCustomers()`
 * descargaba los 6 525 clientes en CADA carga del panel, del POS y de la
 * ficha de cliente.
 */
const TOPE_CLIENTES = 10_000;

function notSupabase() {
  return NextResponse.json(
    {
      error:
        "Backend de clientes en modo local (DATA_SOURCE=mock). Activa Supabase para usar la API compartida.",
    },
    { status: 409 },
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const sp = req.nextUrl.searchParams;
    const search = sp.get("search") ?? undefined;
    // `Math.min(pedido, TOPE)`: el caller puede pedir MENOS (paginación
    // propia futura) pero nunca más que el tope duro.
    const pedido = Number(sp.get("limit"));
    const limit = Math.min(
      Number.isFinite(pedido) && pedido > 0 ? pedido : TOPE_CLIENTES,
      TOPE_CLIENTES,
    );
    const ctx = await getRepoContext();
    const customers = await getRepositories().customer.list(ctx, { search, limit });
    return NextResponse.json(
      { customers },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json({ error: toUserFacingMessage(e, "No se pudo guardar el cliente. Intenta nuevamente.") }, { status: 400 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const body = await req.json();
    const auth = await authorizeRole(CUSTOMER_MANAGE_ROLES);
    if (!auth.ok) return auth.res;
    const parsed = createCustomerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos del cliente inválidos." },
        { status: 422 },
      );
    }
    const ctx = await getRepoContext();
    const customer = await getRepositories().customer.create(ctx, body);
    return NextResponse.json({ customer }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: toUserFacingMessage(e, "No se pudo guardar el cliente. Intenta nuevamente.") }, { status: 400 });
  }
}
