import type { DgiiAmbienteTarget } from "@/features/dgii/core/killswitches";
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
 * Un default que devuelva `"ecf"` o `"certecf"` ante un valor desconocido
 * convierte un descuido de configuración en un comprobante fiscal REAL ante
 * el Estado, y eso no se deshace. Por eso este guard es incondicional:
 * solo `"ecf"` o `"certecf"` con valorexacto salen como escritos; cualquier
 * otra cosa —`null`, `undefined`, cadena vacía, valor desconocido— cae a `testecf`.
 */
export function modoFiscal(
  config: ConfiguracionFiscal,
): "testecf" | "certecf" | "ecf" {
  const a = config.ambiente;
  if (a === "certecf") return "certecf";
  if (a === "ecf") return "ecf";
  return "testecf";
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
