import "server-only";
import { assessCertificateExpiry } from "@/features/dgii/certificate-expiry";
import { statusLabel, type EcfStatus } from "@/features/dgii/document-state";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { verifySchemaIntegrity } from "./xsd-registry";

/**
 * Lo que hay que saber del módulo fiscal de un vistazo.
 *
 * Lee **la base de verdad**. La pantalla de DGII llevaba meses enseñando datos
 * de mentira (`mockElectronicInvoices`), y una pantalla que enseña números
 * inventados es peor que no tener pantalla: se mira, se cree y se decide sobre
 * ella.
 *
 * Todo lo de aquí sale de una sola pasada por la tabla. Un panel que hace ocho
 * consultas para pintar ocho números tarda ocho veces más en decir «no hay
 * nada», que es lo que va a decir la mayoría de los días.
 */

export interface DgiiDashboard {
  /** ¿Está encendido el envío a la DGII? Hoy `false` por política. */
  sendEnabled: boolean;
  ambiente: string;
  /** Cuántos comprobantes hay en cada estado. Solo los que no están en cero. */
  porEstado: Array<{ status: EcfStatus; label: string; count: number }>;
  total: number;
  /** Esperando a que la cola los toque. */
  pendientes: number;
  /** Con cita para reintentar. */
  conReintento: number;
  /** Fallaron y ya no se reintentan. */
  enError: number;
  autorizados: number;
  rechazados: number;
  /** El de más tiempo esperando, para ver si la cola se atascó. */
  masAntiguoPendiente: { eNcf: string; status: EcfStatus; desde: string } | null;
  certificado: {
    presente: boolean;
    venceEn?: number;
    nivel?: string;
    mensaje?: string;
  };
  esquemas: { total: number; correctos: number; ok: boolean };
}

const PENDIENTES: EcfStatus[] = [
  "draft",
  "generated",
  "validated",
  "signed",
  "submitted",
  "in_process",
];

export async function loadDgiiDashboard(
  businessId: string,
): Promise<DgiiDashboard> {
  const admin = createServiceRoleClient();
  const vacio: DgiiDashboard = {
    sendEnabled: env.DGII_TESTECF_SEND_ENABLED === "true",
    ambiente: env.DGII_ENVIRONMENT ?? "testecf",
    porEstado: [],
    total: 0,
    pendientes: 0,
    conReintento: 0,
    enError: 0,
    autorizados: 0,
    rechazados: 0,
    masAntiguoPendiente: null,
    certificado: { presente: false },
    esquemas: { total: 0, correctos: 0, ok: false },
  };
  if (!admin) return vacio;

  const [{ data: filas }, { data: cert }, integridad] = await Promise.all([
    admin
      .from("electronic_invoices")
      .select("status, e_ncf, next_retry_at, created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: true })
      .limit(5000),
    admin
      .from("dgii_certificates")
      .select("valid_to, revoked_at")
      .eq("business_id", businessId)
      .eq("is_active", true)
      .maybeSingle(),
    verifySchemaIntegrity(),
  ]);

  const documentos = filas ?? [];
  const conteo = new Map<EcfStatus, number>();
  let conReintento = 0;
  let masAntiguo: DgiiDashboard["masAntiguoPendiente"] = null;

  for (const d of documentos) {
    const s = d.status as EcfStatus;
    conteo.set(s, (conteo.get(s) ?? 0) + 1);
    if (d.next_retry_at) conReintento += 1;
    // La lista viene ordenada por fecha, así que el primero que cumpla es el
    // más viejo: no hace falta comparar fechas a mano.
    if (!masAntiguo && PENDIENTES.includes(s)) {
      masAntiguo = { eNcf: d.e_ncf, status: s, desde: d.created_at };
    }
  }

  const cuenta = (s: EcfStatus) => conteo.get(s) ?? 0;

  const ahora = new Date();
  // Un certificado revocado no vale aunque su fecha esté lejos: para el sistema
  // es lo mismo que no tenerlo.
  const certificado: DgiiDashboard["certificado"] =
    cert?.valid_to && !cert.revoked_at
      ? (() => {
          const a = assessCertificateExpiry(cert.valid_to as string, ahora);
          return {
            presente: true,
            venceEn: a.daysLeft,
            nivel: a.level,
            mensaje: a.message,
          };
        })()
      : { presente: false };

  const correctos = integridad.filter((i) => i.ok).length;

  return {
    sendEnabled: env.DGII_TESTECF_SEND_ENABLED === "true",
    ambiente: env.DGII_ENVIRONMENT ?? "testecf",
    porEstado: [...conteo.entries()]
      .map(([status, count]) => ({ status, label: statusLabel(status), count }))
      .sort((a, b) => b.count - a.count),
    total: documentos.length,
    pendientes: PENDIENTES.reduce((s, e) => s + cuenta(e), 0),
    conReintento,
    enError: cuenta("error"),
    autorizados: cuenta("accepted") + cuenta("accepted_conditional"),
    rechazados: cuenta("rejected"),
    masAntiguoPendiente: masAntiguo,
    certificado,
    esquemas: {
      total: integridad.length,
      correctos,
      ok: correctos === integridad.length,
    },
  };
}
