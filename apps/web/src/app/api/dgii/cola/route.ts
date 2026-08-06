import { NextResponse, type NextRequest } from "next/server";
import { authorizeDgii } from "@/server/auth/require-role";
import { env } from "@/lib/env";
import { LOCAL_HANDLERS } from "@/server/services/dgii/queue-handlers";
import {
  businessesWithPendingWork,
  runQueueForBusiness,
  type WorkerResult,
} from "@/server/services/dgii/queue-worker";

/**
 * Una pasada de la cola fiscal.
 *
 * Dos formas de entrar, y **las dos hay que demostrarlas**:
 *
 *  · **El cron de Vercel**, con `Authorization: Bearer $CRON_SECRET`. Sin
 *    `CRON_SECRET` configurado, esta puerta **no existe** — no se abre "por
 *    ahora" ni se cae a un valor por defecto: una cola fiscal abierta a quien
 *    sepa la URL es una cola que cualquiera puede disparar.
 *  · **Una persona**, con el permiso `dgii.retry`. Es el botón de "reintentar
 *    ahora" cuando alguien está mirando y no quiere esperar al cron.
 *
 * NO envía nada a la DGII mientras `DGII_TESTECF_SEND_ENABLED` sea `false`: el
 * trabajador adelanta lo local y se para en la frontera. La respuesta lo dice
 * en `waitingForSend` en vez de callárselo.
 */

export const dynamic = "force-dynamic";

/** Tope de negocios por pasada: la función tiene un techo de tiempo. */
const MAX_NEGOCIOS = 5;

/** ¿Viene del cron con el secreto correcto? Comparación de tiempo constante. */
function esCronAutorizado(request: NextRequest): boolean {
  const esperado = process.env.CRON_SECRET;
  // Sin secreto configurado, esta puerta está cerrada. A propósito.
  if (!esperado) return false;

  const recibido = request.headers.get("authorization") ?? "";
  const prefijo = "Bearer ";
  if (!recibido.startsWith(prefijo)) return false;

  const valor = recibido.slice(prefijo.length);
  // Longitudes distintas se descartan antes: comparar sin esto filtraría el
  // largo del secreto por el tiempo de respuesta.
  if (valor.length !== esperado.length) return false;

  let diferencia = 0;
  for (let i = 0; i < valor.length; i++) {
    diferencia |= valor.charCodeAt(i) ^ esperado.charCodeAt(i);
  }
  return diferencia === 0;
}

async function procesar(
  disparadaPor: "cron" | "persona",
): Promise<NextResponse> {
  const negocios = (await businessesWithPendingWork()).slice(0, MAX_NEGOCIOS);

  // Uno por uno y en serie: cada negocio tiene su certificado y sus secuencias,
  // y un lote mezclado podría firmar el comprobante de uno con el certificado
  // de otro.
  const resultados: WorkerResult[] = [];
  for (const businessId of negocios) {
    resultados.push(
      await runQueueForBusiness({
        businessId,
        // Solo los manejadores LOCALES: validar y firmar. `enviar` y
        // `consultar` no están, y el trabajador los cuenta como pendientes en
        // vez de fingir que los hizo.
        handlers: LOCAL_HANDLERS,
        correlationId: `cola-${disparadaPor}`,
      }),
    );
  }

  const total = resultados.reduce(
    (acc, r) => ({
      found: acc.found + r.found,
      picked: acc.picked + r.picked,
      advanced: acc.advanced + r.advanced,
      waitingForSend: acc.waitingForSend + r.waitingForSend,
      failed: acc.failed + r.failed,
      skipped: acc.skipped + r.skipped,
    }),
    { found: 0, picked: 0, advanced: 0, waitingForSend: 0, failed: 0, skipped: 0 },
  );

  return NextResponse.json(
    {
      ok: true,
      triggeredBy: disparadaPor,
      sendEnabled: env.DGII_TESTECF_SEND_ENABLED === "true",
      businesses: negocios.length,
      total,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// El portero se repite en los dos handlers a propósito, en vez de esconderse en
// una función compartida. `routes-guarded.test.ts` comprueba que CADA handler
// exportado tiene el suyo, y esa comprobación solo vale mientras sea tonta de
// leer: un archivo donde el portero está a dos saltos de distancia es un archivo
// donde nadie ve que a un handler le falta.

/** El cron de Vercel llama con GET. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (esCronAutorizado(request)) return procesar("cron");
  const auth = await authorizeDgii("dgii.retry");
  if (!auth.ok) return auth.res;
  return procesar("persona");
}

/** Una persona, desde el botón de "procesar ahora". */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (esCronAutorizado(request)) return procesar("cron");
  const auth = await authorizeDgii("dgii.retry");
  if (!auth.ok) return auth.res;
  return procesar("persona");
}
