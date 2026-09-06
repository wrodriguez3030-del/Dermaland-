import "server-only";

/**
 * Menor (segunda tanda, revisión externa): este archivo llama a
 * `createServiceRoleClient()` -la service-role key de Supabase- igual que
 * `certificates.ts`, `enablement.ts`, `prepare.ts` y `storage.ts`, pero era
 * el ÚNICO de los cinco sin `import "server-only"`. Sin él, Next.js no
 * impide que un Client Component importe este módulo por error y arrastre
 * la clave hacia el bundle del navegador; con él, el build falla en el
 * momento en que alguien lo intente, no en producción. Prueba de fijación
 * para los cinco archivos a la vez: `server-only-imports.test.ts`.
 */
import type { DgiiAmbienteTarget } from "@/features/dgii/core/killswitches";
import { ambienteTargetOf } from "@/features/dgii/core/killswitches";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { crearRepositorioConfiguracion } from "@/server/repositories/supabase/dgii-settings";

/**
 * Configuración fiscal del negocio para emisión de comprobantes.
 * Los campos que aquí son `null | string` pueden venir nulos o vacíos de la BD.
 */
export interface ConfiguracionFiscal {
  businessId: string;
  rncEmisor: string | null;
  razonSocialEmisor: string | null;
  direccionEmisor: string | null;
  provinciaCodigo: string | null;
  municipioCodigo: string | null;
  correoEmisor: string | null;
  telefonoEmisor: string | null;
  ambiente: DgiiAmbienteTarget;
  dgiiEnabledRealSend: boolean;
}

/**
 * ¿Tiene el negocio la configuración fiscal mínima para emitir?
 *
 * Exige `rncEmisor`, `razonSocialEmisor` y `direccionEmisor` no vacíos:
 * son los datos que identifican al emisor ante la DGII y van dentro del XML.
 * Sin ellos, el comprobante no es válido.
 */
export function estaConfigurado(config: ConfiguracionFiscal): boolean {
  return !!(
    config.rncEmisor && config.razonSocialEmisor && config.direccionEmisor
  );
}

/**
 * Modo fiscal del negocio: dónde emite comprobantes.
 *
 * **CRÍTICO: el ambiente por defecto es SIEMPRE `testecf` (pruebas), NUNCA el real.**
 *
 * Delega a `ambienteTargetOf` del núcleo (la versión de producción en agendapp).
 * Una única implementación evita la divergencia: si la regla de ambiente se ajusta,
 * el cambio no se puede olvidar en dos lugares.
 *
 * Un default que devuelva `"ecf"` o `"certecf"` ante un valor desconocido
 * convierte un descuido de configuración en un comprobante fiscal REAL ante
 * el Estado, y eso no se deshace. Por eso el guard es incondicional:
 * solo `"ecf"` o `"certecf"` con valor exacto salen como escritos; cualquier
 * otra cosa —`null`, `undefined`, cadena vacía, valor desconocido— cae a `testecf`.
 */
export function modoFiscal(
  config: ConfiguracionFiscal,
): "testecf" | "certecf" | "ecf" {
  return ambienteTargetOf(config.ambiente);
}

/**
 * Lee la configuración fiscal del negocio desde la base de datos.
 *
 * Usa el cliente de `service_role` para acceder a `dgii_settings`.
 * Devuelve `null` si Supabase no está configurado o si no hay configuración guardada.
 */
export async function obtenerConfiguracion(
  businessId: string,
): Promise<ConfiguracionFiscal | null> {
  const cliente = createServiceRoleClient();
  if (!cliente) return null;

  const repo = crearRepositorioConfiguracion(cliente, businessId);
  const fila = await repo.leerConfiguracion();

  if (!fila) return null;

  return {
    businessId: fila.business_id,
    rncEmisor: fila.rnc_emisor,
    razonSocialEmisor: fila.razon_social_emisor,
    direccionEmisor: fila.direccion_emisor,
    provinciaCodigo: fila.provincia_codigo,
    municipioCodigo: fila.municipio_codigo,
    correoEmisor: fila.correo_emisor,
    telefonoEmisor: fila.telefono_emisor,
    ambiente: fila.ambiente,
    dgiiEnabledRealSend: fila.dgii_enabled_real_send,
  };
}
