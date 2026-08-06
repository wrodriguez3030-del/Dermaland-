import "server-only";
import type { EcfStatus } from "@/features/dgii/document-state";
import {
  actionFor,
  gateAction,
  LOTE_MAXIMO,
  pickBatch,
  type QueueAction,
  type QueueCandidate,
} from "@/features/dgii/queue-policy";
import { env } from "@/lib/env";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { applyTransition, recordFailure } from "./transitions";

/**
 * El trabajador de la cola.
 *
 * Saca de la base lo que toca, decide qué hacerle y lo hace. Todo lo difícil
 * —qué es «lo que toca», en qué orden, cuándo se puede— vive fuera, en
 * `queue-policy.ts`, que es puro y está probado sin base de datos ni reloj.
 * Aquí solo queda la fontanería.
 *
 * DOS COSAS QUE NO SE NEGOCIAN
 *
 * **1 · Un negocio cada vez.** El lote se elige POR NEGOCIO y nunca se mezclan.
 * Cada uno tiene su certificado, sus secuencias y su ambiente; un lote mezclado
 * podría firmar el comprobante de un negocio con el certificado de otro, que es
 * de los errores que no se descubren hasta que llama la DGII.
 *
 * **2 · Se para antes de hablar con la DGII.** Con `DGII_TESTECF_SEND_ENABLED`
 * apagado, el trabajador adelanta el trabajo local —validar, firmar— y se
 * detiene justo antes de enviar. Así, el día que se habilite, lo pendiente sale
 * de inmediato en vez de empezar de cero. El freno vive en `gateAction`, no en
 * un `if` suelto en medio del bucle.
 */

/** Estados desde los que la cola sigue empujando. Espejo de `queue-policy`. */
const PROCESABLES = [
  "generated",
  "validated",
  "signed",
  "submitted",
  "in_process",
  "error",
];

export interface WorkerResult {
  businessId: string;
  /** Candidatos que había. */
  found: number;
  /** Los que entraron en el lote. */
  picked: number;
  /** Los que avanzaron de estado. */
  advanced: number;
  /** Los que esperaban a que se habilite el envío. */
  waitingForSend: number;
  /** Los que fallaron y tienen cita. */
  failed: number;
  /** Los que otro proceso movió mientras tanto. */
  skipped: number;
}

/**
 * Lo que sabe hacer el trabajador con un documento.
 *
 * Entra por parámetro para que el trabajador se pueda probar sin firmar nada ni
 * hablar con nadie — y para que el día que exista el envío real, se enchufe aquí
 * sin tocar el bucle.
 */
export interface QueueHandlers {
  validar?: (invoiceId: string, businessId: string) => Promise<HandlerOutcome>;
  firmar?: (invoiceId: string, businessId: string) => Promise<HandlerOutcome>;
  enviar?: (invoiceId: string, businessId: string) => Promise<HandlerOutcome>;
  consultar?: (invoiceId: string, businessId: string) => Promise<HandlerOutcome>;
}

export type HandlerOutcome =
  | { ok: true; to: EcfStatus; patch?: Record<string, unknown> }
  | {
      ok: false;
      error: {
        httpStatus?: number;
        dgiiCode?: string;
        networkCode?: string;
        delivered?: boolean;
        certificateProblem?: boolean;
        missingConfig?: boolean;
      };
    };

export interface RunOptions {
  businessId: string;
  handlers?: QueueHandlers;
  limit?: number;
  now?: Date;
  correlationId?: string;
}

/** Los candidatos de ESTE negocio, sin mezclar con nadie. */
async function cargarCandidatos(
  businessId: string,
  limit: number,
): Promise<QueueCandidate[]> {
  const admin = createServiceRoleClient();
  if (!admin) return [];

  // Se pide algo más de lo que cabe en el lote: `pickBatch` todavía descarta
  // los que tienen cita en el futuro, así que traer justo el tamaño del lote
  // dejaría pasadas medio vacías.
  const { data } = await admin
    .from("electronic_invoices")
    .select("id, status, next_retry_at, retry_count, created_at")
    .eq("business_id", businessId)
    .in("status", PROCESABLES)
    .order("created_at", { ascending: true })
    .limit(limit * 5);

  return (data ?? []).map((d) => ({
    id: d.id,
    status: d.status as EcfStatus,
    nextRetryAt: d.next_retry_at,
    retryCount: d.retry_count ?? 0,
    createdAt: d.created_at,
  }));
}

/**
 * Una pasada de la cola para un negocio.
 *
 * No lanza. Un comprobante que revienta no puede tumbar la pasada entera y
 * dejar a los otros nueve sin procesar; se registra su fallo y se sigue.
 */
export async function runQueueForBusiness(
  options: RunOptions,
): Promise<WorkerResult> {
  const { businessId } = options;
  const now = options.now ?? new Date();
  const limite = Math.min(options.limit ?? LOTE_MAXIMO, LOTE_MAXIMO);
  const envioHabilitado = env.DGII_TESTECF_SEND_ENABLED === "true";

  const resultado: WorkerResult = {
    businessId,
    found: 0,
    picked: 0,
    advanced: 0,
    waitingForSend: 0,
    failed: 0,
    skipped: 0,
  };

  const candidatos = await cargarCandidatos(businessId, limite);
  resultado.found = candidatos.length;

  const lote = pickBatch(candidatos, { now, limit: limite });
  resultado.picked = lote.length;

  for (const documento of lote) {
    const accion = actionFor(documento.status);
    if (!accion) continue;

    const puerta = gateAction(accion, envioHabilitado);
    if (!puerta.allowed) {
      // No se toca el documento ni se gasta un reintento: no ha fallado nada,
      // solo está esperando a que alguien encienda el envío.
      resultado.waitingForSend += 1;
      continue;
    }

    const manejador = handlerFor(options.handlers, accion);
    if (!manejador) {
      // Todavía no existe quien haga esto. Se cuenta y se sigue; fingir que se
      // hizo sería peor que no hacerlo.
      resultado.waitingForSend += 1;
      continue;
    }

    let salida: HandlerOutcome;
    try {
      salida = await manejador(documento.id, businessId);
    } catch (e) {
      salida = {
        ok: false,
        error: {
          networkCode:
            e && typeof e === "object" && "code" in e
              ? String((e as { code: unknown }).code)
              : undefined,
        },
      };
    }

    if (salida.ok) {
      const movido = await applyTransition({
        businessId,
        invoiceId: documento.id,
        to: salida.to,
        patch: salida.patch,
        correlationId: options.correlationId,
      });
      if (movido.ok) resultado.advanced += 1;
      else resultado.skipped += 1;
      continue;
    }

    await recordFailure({
      businessId,
      invoiceId: documento.id,
      currentStatus: documento.status,
      attempt: documento.retryCount + 1,
      error: salida.error,
      correlationId: options.correlationId,
    });
    resultado.failed += 1;
  }

  return resultado;
}

function handlerFor(
  handlers: QueueHandlers | undefined,
  action: QueueAction,
): ((id: string, businessId: string) => Promise<HandlerOutcome>) | undefined {
  if (!handlers) return undefined;
  switch (action) {
    case "validar":
      return handlers.validar;
    case "firmar":
      return handlers.firmar;
    case "enviar":
      return handlers.enviar;
    case "consultar":
      return handlers.consultar;
    // `reintentar` no es una acción propia: el documento está en `error` y lo
    // que toca es repetir el paso donde falló. Lo resuelve quien lo reencola.
    case "reintentar":
      return undefined;
  }
}

/** Negocios con algo pendiente. Uno por uno, nunca en el mismo lote. */
export async function businessesWithPendingWork(): Promise<string[]> {
  const admin = createServiceRoleClient();
  if (!admin) return [];
  const { data } = await admin
    .from("electronic_invoices")
    .select("business_id")
    .in("status", PROCESABLES)
    .limit(1000);
  return [...new Set((data ?? []).map((d) => d.business_id))];
}
