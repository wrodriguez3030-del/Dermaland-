import { NextResponse } from "next/server";
import { forgetCustomer } from "@/server/services/storefront/returning-customer";

/**
 * "No soy yo": borra la galleta que recuerda al cliente en este dispositivo.
 *
 * Pública, como el resto de `/api/storefront`: la tienda no tiene sesión. No
 * hace falta protegerla —lo único que puede provocar quien la llame es que un
 * navegador deje de recordar sus propios datos— y la alternativa, borrarla
 * desde el JavaScript de la página, exigiría que la galleta NO fuera `httpOnly`,
 * que es justo lo que la protege de un XSS.
 */

export const dynamic = "force-dynamic";

export async function POST() {
  await forgetCustomer();
  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
