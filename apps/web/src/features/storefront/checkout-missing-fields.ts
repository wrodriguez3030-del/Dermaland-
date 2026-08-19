// Qué le falta al checkout para poder enviarse.
//
// La regla vive aquí, pura y con prueba, y no repartida por el componente: la
// lección de `checkout-fulfillment.ts`, donde una regla metida en la pantalla
// mantuvo vivo un fallo ya "corregido". El botón de enviar no se deshabilita
// en silencio; al pulsarlo, esto dice exactamente qué marcar.

/** Ids de los elementos del DOM a los que se desplaza y marca la pantalla. */
export type CheckoutFieldId =
  | "contactName"
  | "contactPhone"
  | "fulfillment"
  | "province"
  | "sector"
  | "address";

export interface CheckoutSnapshot {
  nombre: string;
  telefono: string;
  entrega: "pickup" | "delivery" | null;
  provincia: string;
  sector: string;
  direccion: string;
}

export interface MissingField {
  field: CheckoutFieldId;
  /** Para el resumen: "tu nombre", "tu teléfono"… */
  label: string;
  /** Bajo el campo: "Falta tu nombre." */
  message: string;
}

const vacio = (texto: string) => texto.trim() === "";

/**
 * En orden de pantalla. Los campos de envío solo se piden con el envío ya
 * elegido: reclamar la provincia a quien aún no dijo cómo recibe sería ruido.
 * El correo, la referencia y la nota son opcionales; la sucursal de retiro
 * arranca con la primera y siempre tiene valor.
 */
export function missingCheckoutFields(s: CheckoutSnapshot): MissingField[] {
  const faltan: MissingField[] = [];

  if (vacio(s.nombre)) {
    faltan.push({
      field: "contactName",
      label: "tu nombre",
      message: "Falta tu nombre.",
    });
  }
  if (vacio(s.telefono)) {
    faltan.push({
      field: "contactPhone",
      label: "tu teléfono",
      message: "Falta tu teléfono.",
    });
  }
  if (s.entrega === null) {
    faltan.push({
      field: "fulfillment",
      label: "cómo lo recibes",
      message: "Elige si lo retiras en sucursal o te lo llevamos.",
    });
    return faltan;
  }

  if (s.entrega === "delivery") {
    if (vacio(s.provincia)) {
      faltan.push({
        field: "province",
        label: "tu provincia",
        message: "Elige tu provincia.",
      });
    }
    if (vacio(s.sector)) {
      faltan.push({
        field: "sector",
        label: "tu sector",
        message: "Falta tu sector.",
      });
    }
    if (vacio(s.direccion)) {
      faltan.push({
        field: "address",
        label: "tu dirección",
        message: "Falta tu dirección.",
      });
    }
  }

  return faltan;
}
