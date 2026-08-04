import "server-only";
import {
  missingAzulKeys,
  resolvePaymentProvider,
} from "@/features/storefront/payments/registry";
import type { PaymentProvider } from "@/features/storefront/payments/types";

/**
 * El cobro con tarjeta, del lado del servidor.
 *
 * Hoy devuelve `null` en producción **siempre**: no hay afiliación de comercio
 * electrónico con ningún banco, y el proveedor simulado tiene prohibido
 * activarse ahí. Eso no es una carencia del módulo, es su estado correcto.
 *
 * Cuando llegue la afiliación, lo único que hay que hacer es escribir
 * `features/storefront/payments/azul.ts` cumpliendo `PaymentProvider` y
 * devolverlo desde el registro. Ni el checkout, ni el pedido, ni la base de
 * datos cambian. El paso a paso está en `docs/pagos-en-linea.md`.
 */

/** Lee el entorno UNA vez. El registro es puro; esto es lo que lo alimenta. */
function entorno(): Record<string, string | undefined> {
  return {
    PAYMENTS_PROVIDER: process.env.PAYMENTS_PROVIDER,
    AZUL_MERCHANT_ID: process.env.AZUL_MERCHANT_ID,
    AZUL_AUTH1: process.env.AZUL_AUTH1,
    AZUL_AUTH2: process.env.AZUL_AUTH2,
    AZUL_AUTH_KEY: process.env.AZUL_AUTH_KEY,
    AZUL_CERT_PATH: process.env.AZUL_CERT_PATH,
    AZUL_KEY_PATH: process.env.AZUL_KEY_PATH,
    AZUL_BASE_URL: process.env.AZUL_BASE_URL,
  };
}

/** El proveedor activo, o `null` si no se cobra en línea. */
export function activePaymentProvider(): PaymentProvider | null {
  return resolvePaymentProvider(
    entorno(),
    process.env.NODE_ENV ?? "development",
  );
}

/** ¿Se puede pagar con tarjeta ahora mismo? Hoy, en producción: no. */
export function paymentsEnabled(): boolean {
  return activePaymentProvider() !== null;
}

export interface PaymentReadiness {
  /** `true` sólo cuando un cliente puede pagar de verdad. */
  enabled: boolean;
  /** Qué proveedor está activo, para la pantalla de diagnóstico. */
  provider: string | null;
  /** Variables de Azul que faltan. Vacío no significa "listo": falta el adaptador. */
  missingAzul: string[];
  /** Frase para una persona, no un código. */
  summary: string;
}

/**
 * Diagnóstico para el administrador: por qué no se cobra y qué falta.
 *
 * Existe para que nadie tenga que leer código —ni adivinar— cuando pregunte
 * "¿ya podemos cobrar con tarjeta?".
 */
export function paymentReadiness(): PaymentReadiness {
  const provider = activePaymentProvider();
  const faltan = missingAzulKeys(entorno());
  const elegido = (process.env.PAYMENTS_PROVIDER ?? "").trim();

  if (provider) {
    return {
      enabled: true,
      provider: provider.id,
      missingAzul: faltan,
      summary: `Cobro activo con ${provider.label}.`,
    };
  }

  if (!elegido) {
    return {
      enabled: false,
      provider: null,
      missingAzul: faltan,
      summary:
        "El cobro con tarjeta está apagado: no se ha elegido pasarela. Los pedidos se pagan al retirar en sucursal.",
    };
  }

  if (elegido === "azul") {
    return {
      enabled: false,
      provider: null,
      missingAzul: faltan,
      summary: faltan.length
        ? `Falta configurar ${faltan.length} credencial(es) de Azul: ${faltan.join(", ")}.`
        : "Credenciales de Azul completas, pero falta escribir el adaptador. Ver docs/pagos-en-linea.md.",
    };
  }

  return {
    enabled: false,
    provider: null,
    missingAzul: faltan,
    summary: `"${elegido}" no es una pasarela conocida. Los pedidos se pagan al retirar en sucursal.`,
  };
}
