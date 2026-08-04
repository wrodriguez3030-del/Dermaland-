// Quién cobra, si es que cobra alguien.
//
// Función PURA a propósito —recibe el entorno, no lo lee— para poder probar el
// caso que de verdad importa: que el proveedor simulado **nunca** se active en
// producción. Esa es la única barrera entre "estamos preparados para cobrar" y
// "le dijimos a un cliente real que había pagado cuando no pagó nada".
//
// Fail-closed en todos los caminos: sin configurar no hay cobro, a medio
// configurar tampoco, y un proveedor desconocido tampoco. El estado por defecto
// de este módulo —y el de producción hoy— es **no cobrar**.

import { SimulatedPaymentProvider } from "./simulated";
import type { PaymentProvider } from "./types";

/** Variables que necesita Azul. Todas, o no se activa. */
const AZUL_REQUERIDAS = [
  "AZUL_MERCHANT_ID",
  "AZUL_AUTH1",
  "AZUL_AUTH2",
  "AZUL_AUTH_KEY",
  "AZUL_CERT_PATH",
  "AZUL_KEY_PATH",
  "AZUL_BASE_URL",
] as const;

export type PaymentEnv = Partial<Record<string, string>>;

function completo(env: PaymentEnv, claves: readonly string[]): boolean {
  return claves.every((k) => (env[k] ?? "").trim().length > 0);
}

/**
 * El proveedor activo, o `null` si no hay cobro en línea.
 *
 * `nodeEnv` se pasa por parámetro —en vez de leer `process.env.NODE_ENV`— para
 * que la prueba del caso de producción no dependa de cómo se ejecute.
 */
export function resolvePaymentProvider(
  env: PaymentEnv,
  nodeEnv: string,
): PaymentProvider | null {
  const elegido = (env.PAYMENTS_PROVIDER ?? "").trim();
  if (!elegido) return null;

  if (elegido === "simulated") {
    // LA regla de este módulo. Un checkout de mentira delante de un cliente real
    // es peor que no tener checkout: el cliente cree que pagó, no aparece a
    // retirar, y la venta se pierde con él enfadado.
    if (nodeEnv === "production") return null;
    return new SimulatedPaymentProvider();
  }

  if (elegido === "azul") {
    // A medio configurar es el peor estado posible: la interfaz ofrecería pagar
    // y el banco rechazaría todo. Mejor que el cobro sencillamente no exista.
    if (!completo(env, AZUL_REQUERIDAS)) return null;

    // AQUÍ va el adaptador el día que exista la afiliación:
    //
    //   return new AzulPaymentProvider({
    //     merchantId: env.AZUL_MERCHANT_ID!, auth1: env.AZUL_AUTH1!, ...
    //   });
    //
    // No se escribe antes de tener el paquete de integración del banco: una
    // integración bancaria escrita contra la documentación pública y sin poder
    // probarla contra su entorno de pruebas no es trabajo adelantado, es una
    // suposición con apariencia de código. Paso a paso en `docs/pagos-en-linea.md`.
    return null;
  }

  return null;
}

/** Qué le falta a Azul para poder activarse. Para la pantalla de diagnóstico. */
export function missingAzulKeys(env: PaymentEnv): string[] {
  return AZUL_REQUERIDAS.filter((k) => !(env[k] ?? "").trim());
}
