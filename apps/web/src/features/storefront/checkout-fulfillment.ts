// Con qué opción de entrega arranca el checkout.
//
// Una línea de código no merecería un archivo propio. Este sí, porque ya se
// perdió una vez: la corrección que quitó la preselección tocó las cuatro
// ramas de la pantalla que miran `null` y **se dejó el inicializador sin
// cambiar**. `entrega` nunca podía ser `null`, el fallo seguía vivo, y la
// pantalla estaba entera escrita para evitarlo.
//
// TypeScript no lo vio: comparar contra `null` está permitido aunque el tipo no
// lo incluya, así que las cuatro ramas muertas no dieron ni un aviso.
//
// Aquí la regla se puede probar sin montar el formulario, y la prueba falla si
// alguien vuelve a preseleccionar.

export type Fulfillment = "pickup" | "delivery";

/**
 * `null` = el cliente todavía no ha elegido, y tiene que hacerlo.
 *
 * Con envío configurado no hay valor por defecto: elegir cómo recibes lo que
 * compras es un acto, no un descuido. Sin ninguna provincia con tarifa solo
 * existe el retiro, y ahí no hay nada que elegir.
 */
export function initialFulfillment(
  deliverableProvinceCount: number,
): Fulfillment | null {
  return deliverableProvinceCount > 0 ? null : "pickup";
}
