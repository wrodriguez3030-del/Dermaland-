import "server-only";

/**
 * Gates de habilitación DGII: qué falta para poder emitir un comprobante.
 * Se comprueba ANTES de mirar ningún número fiscal (fase 3A, tarea 4).
 *
 * Portado de `~/Projects/agendapp/src/lib/dgii/enablement-service.ts` +
 * `enablement-evaluator.ts` (SOLO LECTURA, no se modifican). agendapp calcula
 * ahí un checklist de 10 pasos (representante, dry-run, test-local,
 * killswitches, declaración formal, postulación, rango autorizado…) porque
 * ese módulo sirve tanto para "puedo emitir" como para el wizard de
 * certificación/postulación ante DGII. Esta fase deja fuera a propósito la
 * certificación y el envío real (`preflight.ts`, `dry-run.ts`,
 * `submission-service.ts` van a la fase 3B — ver task-4-brief.md, "Lo que
 * esta fase deja fuera"), así que aquí solo quedan los TRES gates que de
 * verdad impiden construir+firmar+persistir un e-CF: configuración fiscal,
 * certificado activo y vigente, y secuencia disponible. Son exactamente
 * `s1`, `s2`+`s3` y `s4` de `evaluateEnablement` en `enablement-evaluator.ts`;
 * `s5`..`s10` (builder local, firma/XSD de prueba, dry-run, representante,
 * declaración) no tienen equivalente en esta fase.
 *
 * Las cinco consultas de Prisma de `getEnablementState` pasan a los
 * repositorios de la fase 2, ya reutilizados de tareas previas:
 *   - `dgiiSettings.findUnique`            → `obtenerConfiguracion` (tarea 3,
 *     `./settings.ts`, que a su vez usa el repositorio).
 *   - `dgiiCertificate.findFirst`          → `leerCertificadoActivo` del
 *     repositorio (ver nota debajo sobre por qué NO se usa `certificates.ts`
 *     para esto).
 *   - Los DOS `ecfSequence.count(...)` (activas / de ambiente `ecf`) →
 *     `contarSecuenciasActivas`, método nuevo en el mismo repositorio de
 *     configuración (`dgii-settings.ts`), en una sola consulta.
 *   - `dgiiEnablementProgress.findUnique` no tiene equivalente aquí: solo
 *     alimenta declaración/postulación/marcas del portal, todo fuera de
 *     esta fase.
 *
 * **Nota sobre `certificates.ts` (tarea 2):** su `obtenerCertificadoActivo`
 * DESCIFRA el `.p12` y, si el certificado activo está vencido (o aún no es
 * vigente), LANZA `ErrorCertificado(..., "vencido")` sin devolver la fila —
 * se pierde `valid_to`, justo el dato que un gate necesita para decir "hay
 * certificado, pero venció el DD/MM" sin reventar. Un gate no puede vivir de
 * una excepción para un caso esperado. Por eso este módulo llama al
 * REPOSITORIO directamente para la metadata (existe + `valid_to`) — es
 * exactamente lo que hace agendapp: su `enablement-service.ts` tampoco pasa
 * por el equivalente de `certificates.ts`, hace su propio `findFirst` con
 * `select: { alias: true, valid_to: true }`. Descifrar el `.p12` para firmar
 * de verdad sigue siendo trabajo exclusivo de `certificates.ts` (lo usará la
 * tarea 5). No es una consulta duplicada: es la misma consulta mínima que ya
 * hace agendapp, sin pasar por el descifrado que un gate no necesita.
 */
import { createServiceRoleClient } from "@/lib/supabase/server";
import { crearRepositorioConfiguracion } from "@/server/repositories/supabase/dgii-settings";
import { estaConfigurado, obtenerConfiguracion } from "./settings";
import { certificadoVigente } from "./certificate-validity";

/**
 * Estado de habilitación fiscal del negocio.
 *
 * `bloqueos` es la ÚNICA fuente de verdad sobre si se puede emitir — es la
 * misma lista que ve el usuario en pantalla (ver `puedeEmitir`). Los demás
 * campos son informativos: `certificadoActivo` es "existe una fila
 * `is_active = true`", no "está vigente" — por eso un certificado vencido
 * puede tener `certificadoActivo: true` y aun así aparecer en `bloqueos`.
 */
export interface EstadoHabilitacion {
  configurado: boolean;
  certificadoActivo: boolean;
  /** ISO 8601 del certificado activo, o `null` si no hay ninguno. */
  certificadoVence: string | null;
  secuenciasActivas: number;
  secuenciasProduccion: number;
  bloqueos: string[];
}

/** `EstadoHabilitacion` con todo bloqueado — para cuando ni siquiera se pudo consultar la base. */
function estadoSinDatos(motivo: string): EstadoHabilitacion {
  return {
    configurado: false,
    certificadoActivo: false,
    certificadoVence: null,
    secuenciasActivas: 0,
    secuenciasProduccion: 0,
    bloqueos: [motivo],
  };
}

/**
 * Reúne configuración fiscal, certificado activo y secuencias disponibles, y
 * compone `bloqueos`: un texto por cada cosa que falte, en orden fijo
 * (configuración → certificado → secuencia) para que la lista sea
 * predecible en pantalla.
 *
 * Usa SIEMPRE el cliente de `service_role`: las tablas fiscales de la fase 2
 * tienen `revoke`/RLS pensado para `service_role`, no para `authenticated`.
 */
export async function evaluarHabilitacion(businessId: string): Promise<EstadoHabilitacion> {
  const cliente = createServiceRoleClient();
  if (!cliente) return estadoSinDatos("Supabase no está configurado.");

  const repo = crearRepositorioConfiguracion(cliente, businessId);

  const [config, certificado, secuencias] = await Promise.all([
    obtenerConfiguracion(businessId),
    repo.leerCertificadoActivo(),
    repo.contarSecuenciasActivas(),
  ]);

  const configurado = config !== null && estaConfigurado(config);
  const certificadoActivo = certificado !== null;
  const certificadoVence = certificado?.valid_to ?? null;
  // Menor (segunda tanda, revisión externa): antes esta línea replicaba a
  // mano el criterio de `s3` en agendapp -solo `valid_to`-, mientras
  // `certificates.ts` ya comprobaba TAMBIÉN `valid_from` al descifrar. Dos
  // reglas de vigencia por separado: un certificado subido con antelación
  // (`valid_from` en el futuro) pasaba ESTE gate como "activo" sin
  // bloqueos, y el hueco solo se descubría al intentar firmar de verdad,
  // con `obtenerCertificadoActivo` lanzando `ErrorCertificado`. Ahora las
  // dos comprobaciones miran la misma `certificadoVigente`
  // (`certificate-validity.ts`).
  const certificadoVencido = certificado !== null && !certificadoVigente(certificado);

  const bloqueos: string[] = [];
  if (!configurado) bloqueos.push("Falta la configuración fiscal DGII.");
  if (!certificadoActivo) bloqueos.push("No hay certificado activo.");
  else if (certificadoVencido) bloqueos.push("El certificado está vencido.");
  if (secuencias.activas === 0) bloqueos.push("No hay secuencia activa.");

  return {
    configurado,
    certificadoActivo,
    certificadoVence,
    secuenciasActivas: secuencias.activas,
    secuenciasProduccion: secuencias.produccion,
    bloqueos,
  };
}

/**
 * `true` solo si `bloqueos` está vacío.
 *
 * NUNCA recompone la decisión a partir de los booleanos sueltos
 * (`configurado`, `certificadoActivo`, `secuenciasActivas`…): eso es
 * exactamente lo que desincroniza la pantalla del servidor. `bloqueos` es la
 * lista que ve el usuario — si trae algo, no se puede emitir, diga lo que
 * diga el resto del estado.
 */
export function puedeEmitir(estado: EstadoHabilitacion): boolean {
  return estado.bloqueos.length === 0;
}
