import type {
  PaymentIntent,
  PaymentProvider,
  PaymentRequest,
  PaymentVerification,
} from "./types";

/**
 * Proveedor SIMULADO. Para desarrollo y pruebas, jamás para cobrar.
 *
 * `registry.ts` se encarga de que nunca se active en producción, y esta clase no
 * se fía de eso: su etiqueta lleva la palabra "prueba" delante, así que si algún
 * día se colara, el cliente vería "Pago de prueba" antes que un botón que
 * pareciera real.
 *
 * No guarda estado: la referencia lleva dentro el pedido, y `verify` responde
 * siempre "pagado" porque su único trabajo es dejar recorrer el flujo entero sin
 * banco. Nada de esto toca dinero.
 */
export class SimulatedPaymentProvider implements PaymentProvider {
  readonly id = "simulated" as const;
  readonly label = "Pago de prueba (no cobra de verdad)";

  async createIntent(request: PaymentRequest): Promise<PaymentIntent> {
    const reference = `SIM-${request.orderNumber}`;
    // Vuelve directamente a la página del pedido: no hay banco al que ir.
    const url = new URL(request.returnUrl);
    url.searchParams.set("pago", "simulado");
    url.searchParams.set("ref", reference);
    return { provider: this.id, reference, redirectUrl: url.toString() };
  }

  async verify(reference: string): Promise<PaymentVerification> {
    return {
      outcome: "pagado",
      reference,
      message: "Pago simulado: no se cobró nada.",
    };
  }
}
