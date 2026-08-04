// El cobro con tarjeta, como INTERFAZ.
//
// DermaLand no tiene todavía afiliación de comercio electrónico con ningún
// banco, y esa afiliación es papeleo con plazos que no dependen del código. Así
// que lo que se construye aquí no es una integración: es el hueco con la forma
// exacta que tendrá que rellenar la integración el día que llegue.
//
// La regla que gobierna todo este módulo: **nada puede decirle a un cliente que
// se le está cobrando mientras no haya una pasarela de verdad detrás**. Un
// checkout que parece cobrar y no cobra es peor que no tener checkout: el
// cliente cree que pagó, no aparece, y la venta se pierde con él enfadado.

/**
 * Quién cobra.
 *
 * `simulated` existe para poder desarrollar y probar el flujo entero sin banco.
 * **Nunca se activa en producción** — ver `registry.ts`.
 */
export type PaymentProviderId = "simulated" | "azul";

/** Lo que el cliente tiene que hacer para pagar. */
export interface PaymentIntent {
  provider: PaymentProviderId;
  /** Identificador del intento en el proveedor. Se guarda para conciliar. */
  reference: string;
  /** A dónde se manda al cliente para pagar. */
  redirectUrl: string;
}

export type PaymentOutcome = "pagado" | "rechazado" | "pendiente";

export interface PaymentVerification {
  outcome: PaymentOutcome;
  reference: string;
  /** Motivo legible cuando se rechaza. Nunca un código crudo del banco. */
  message?: string;
}

/** Lo que el pedido necesita cobrar. Sin datos de tarjeta: eso no pasa por aquí. */
export interface PaymentRequest {
  orderId: string;
  orderNumber: string;
  /** En DOP, con ITBIS incluido. */
  amount: number;
  /** A dónde vuelve el cliente cuando el banco termina. */
  returnUrl: string;
}

/**
 * El contrato que cumplirá Azul —o quien sea— el día que exista la afiliación.
 *
 * Deliberadamente pequeño: crear el intento y verificarlo. Los datos de la
 * tarjeta **nunca** tocan nuestro servidor; el cliente los teclea en la página
 * del banco. Es lo que mantiene a DermaLand fuera del alcance de PCI-DSS.
 */
export interface PaymentProvider {
  readonly id: PaymentProviderId;
  /** Nombre de cara al cliente ("Tarjeta de crédito o débito"). */
  readonly label: string;
  createIntent(request: PaymentRequest): Promise<PaymentIntent>;
  verify(reference: string): Promise<PaymentVerification>;
}
