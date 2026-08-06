import "server-only";
import {
  evaluateTransition,
  isAuthorized,
  statusLabel,
  type EcfStatus,
} from "@/features/dgii/document-state";
import {
  classifyDgiiError,
  nextRetryDelayMs,
  shouldRetry,
  type ClassifiedError,
  type ClassifyInput,
} from "@/features/dgii/error-classification";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * El ÚNICO sitio que mueve el estado de un comprobante fiscal.
 *
 * Las piezas puras —la máquina de estados, la clasificación de errores— no
 * sirven de nada si cada llamador decide por su cuenta cuándo aplicarlas. Aquí
 * se juntan las tres cosas que siempre van juntas:
 *
 *   1. ¿Se puede hacer esta transición?
 *   2. Escribirla.
 *   3. Dejar constancia en el historial.
 *
 * Nadie debería escribir `electronic_invoices.status` con un `update` suelto. Si
 * aparece uno en el código, es un sitio por donde el historial se queda cojo.
 *
 * LA CARRERA QUE ESTO CIERRA
 *
 * Dos procesos pueden intentar mover el mismo documento a la vez: el acuse de
 * la DGII y la consulta por `trackId`. Por eso el `UPDATE` lleva
 * `.eq("status", desde)` — **compara y escribe en una sola operación**. Si otro
 * llegó primero, no se actualiza ninguna fila y aquí nos enteramos, en vez de
 * pisar su resultado.
 */

type Admin = NonNullable<ReturnType<typeof createServiceRoleClient>>;

export interface TransitionInput {
  businessId: string;
  invoiceId: string;
  to: EcfStatus;
  /** Quién lo movió. Ausente = lo movió un proceso, no una persona. */
  actorUserId?: string;
  /** Ata este cambio con la petición que lo provocó. */
  correlationId?: string;
  message?: string;
  /** Datos que se escriben junto al estado (trackId, fechas, hashes…). */
  patch?: Record<string, unknown>;
}

export type ApplyTransitionResult =
  | { ok: true; from: EcfStatus; to: EcfStatus }
  /** No se aplicó y NO es un fallo: repetida, tardía o pisada por otro. */
  | { ok: false; ignored: true; reason: string; message: string }
  /** Sí es un fallo: alguien pidió algo imposible o la base falló. */
  | { ok: false; ignored: false; reason: string; message: string };

/** Marca de tiempo que corresponde a cada estado, si alguna. */
const FECHA_POR_ESTADO: Partial<Record<EcfStatus, string>> = {
  generated: "generated_at",
  signed: "signed_at",
  submitted: "sent_at",
  accepted: "accepted_at",
  accepted_conditional: "accepted_at",
  rejected: "rejected_at",
  cancelled: "cancelled_at",
};

/**
 * Mueve el comprobante y deja constancia.
 *
 * Devuelve `ignored: true` para lo que no debe alarmar a nadie —una respuesta
 * repetida, una consulta que llega tarde, otro proceso que llegó antes— y
 * `ignored: false` solo para lo que alguien tiene que mirar.
 */
export async function applyTransition(
  input: TransitionInput,
): Promise<ApplyTransitionResult> {
  const admin = createServiceRoleClient();
  if (!admin) {
    return {
      ok: false,
      ignored: false,
      reason: "sin-conexion",
      message: "No se pudo acceder a los comprobantes.",
    };
  }

  const { data: actual } = await admin
    .from("electronic_invoices")
    .select("status")
    .eq("id", input.invoiceId)
    .eq("business_id", input.businessId)
    .maybeSingle();

  if (!actual) {
    return {
      ok: false,
      ignored: false,
      reason: "no-encontrado",
      message: "Comprobante no encontrado.",
    };
  }

  const desde = actual.status as EcfStatus;
  const veredicto = evaluateTransition(desde, input.to);
  if (!veredicto.ok) {
    // Lo que llega repetido o tarde se registra en el historial y se ignora:
    // saber que la DGII respondió dos veces vale, alarmar por ello no.
    if (veredicto.reason !== "invalida") {
      await registrarEvento(admin, {
        businessId: input.businessId,
        invoiceId: input.invoiceId,
        from: desde,
        to: input.to,
        eventType: "note",
        message: veredicto.message,
        actorUserId: input.actorUserId,
        correlationId: input.correlationId,
      });
    }
    return {
      ok: false,
      ignored: veredicto.reason !== "invalida",
      reason: veredicto.reason,
      message: veredicto.message,
    };
  }

  const campoFecha = FECHA_POR_ESTADO[input.to];
  const ahora = new Date().toISOString();

  const { data: filas, error } = await admin
    .from("electronic_invoices")
    .update({
      ...(input.patch ?? {}),
      status: input.to,
      ...(campoFecha ? { [campoFecha]: ahora } : {}),
      // Al llegar a buen puerto se apaga el reintento pendiente: si no, la cola
      // volvería a coger un documento ya resuelto.
      ...(isAuthorized(input.to) || input.to === "rejected"
        ? { next_retry_at: null }
        : {}),
      updated_at: ahora,
    })
    // Compara-y-escribe: si otro proceso llegó primero, no toca ninguna fila.
    .eq("id", input.invoiceId)
    .eq("business_id", input.businessId)
    .eq("status", desde)
    .select("id");

  if (error) {
    return {
      ok: false,
      ignored: false,
      reason: "error-base",
      message: "No se pudo cambiar el estado del comprobante.",
    };
  }

  if (!filas || filas.length === 0) {
    // Otro proceso movió el documento entre la lectura y la escritura. No es un
    // fallo: es concurrencia, y el otro ya hizo el trabajo.
    return {
      ok: false,
      ignored: true,
      reason: "pisada",
      message: `Otro proceso movió el comprobante mientras se aplicaba «${statusLabel(input.to)}».`,
    };
  }

  await registrarEvento(admin, {
    businessId: input.businessId,
    invoiceId: input.invoiceId,
    from: desde,
    to: input.to,
    eventType: "transition",
    message: input.message,
    actorUserId: input.actorUserId,
    correlationId: input.correlationId,
  });

  return { ok: true, from: desde, to: input.to };
}

/**
 * Registra un fallo, decide si se reintenta y programa cuándo.
 *
 * El estado NO pasa a `error` cuando el fallo es transitorio: el documento se
 * queda donde estaba con una cita para volver a intentarlo. Marcar `error` cada
 * vez que se cae la red llenaría la pantalla de rojos que se arreglan solos.
 */
export async function recordFailure(input: {
  businessId: string;
  invoiceId: string;
  currentStatus: EcfStatus;
  attempt: number;
  error: ClassifyInput;
  correlationId?: string;
  random?: () => number;
}): Promise<{ classified: ClassifiedError; retryAt: string | null }> {
  const admin = createServiceRoleClient();
  const clasificado = classifyDgiiError(input.error);
  const reintenta = shouldRetry(clasificado, input.attempt);

  const retryAt = reintenta
    ? new Date(
        Date.now() + nextRetryDelayMs(input.attempt + 1, input.random),
      ).toISOString()
    : null;

  if (!admin) return { classified: clasificado, retryAt };

  await admin
    .from("electronic_invoices")
    .update({
      retry_count: input.attempt,
      next_retry_at: retryAt,
      last_error_class: clasificado.class,
      last_error_message: clasificado.message,
      // Solo se marca `error` cuando ya no hay nada más que intentar.
      ...(reintenta ? {} : { status: "error" }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.invoiceId)
    .eq("business_id", input.businessId);

  await registrarEvento(admin, {
    businessId: input.businessId,
    invoiceId: input.invoiceId,
    from: input.currentStatus,
    to: reintenta ? input.currentStatus : "error",
    eventType: reintenta ? "retry_scheduled" : "error",
    errorClass: clasificado.class,
    message: clasificado.message,
    correlationId: input.correlationId,
  });

  return { classified: clasificado, retryAt };
}

/**
 * El historial de un comprobante, en orden.
 *
 * Es lo que se enseña en el detalle y lo que contesta «¿qué pasó y cuándo?»,
 * que es la pregunta real cuando algo sale mal.
 */
export async function documentHistory(
  businessId: string,
  invoiceId: string,
): Promise<
  Array<{
    at: string;
    from?: string;
    to: string;
    type: string;
    message?: string;
    errorClass?: string;
  }>
> {
  const admin = createServiceRoleClient();
  if (!admin) return [];
  const { data } = await admin
    .from("ecf_document_events")
    .select("created_at, status_from, status_to, event_type, message, error_class")
    .eq("business_id", businessId)
    .eq("electronic_invoice_id", invoiceId)
    .order("created_at", { ascending: true });

  return (data ?? []).map((e) => ({
    at: e.created_at,
    from: e.status_from ?? undefined,
    to: e.status_to,
    type: e.event_type,
    message: e.message ?? undefined,
    errorClass: e.error_class ?? undefined,
  }));
}

/**
 * Escribe el evento. Que esto falle NO deshace la transición.
 *
 * Perder una línea de historial es malo; deshacer un cambio de estado fiscal ya
 * escrito, y quedarse sin saber si la DGII lo aceptó, es peor.
 */
async function registrarEvento(
  admin: Admin,
  e: {
    businessId: string;
    invoiceId: string;
    from?: EcfStatus | null;
    to: EcfStatus;
    eventType: string;
    errorClass?: string;
    message?: string;
    actorUserId?: string;
    correlationId?: string;
  },
): Promise<void> {
  try {
    await admin.from("ecf_document_events").insert({
      business_id: e.businessId,
      electronic_invoice_id: e.invoiceId,
      status_from: e.from ?? null,
      status_to: e.to,
      event_type: e.eventType,
      error_class: e.errorClass ?? null,
      message: e.message ?? null,
      actor_user_id: e.actorUserId ?? null,
      correlation_id: e.correlationId ?? null,
    });
  } catch {
    // Silencio deliberado. Ver el comentario de arriba.
  }
}
