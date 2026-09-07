/**
 * 🔴 «Total gastado» del cliente significa DOS cosas distintas, y la
 * diferencia son dos clics.
 *
 *  - La FICHA (`app/(app)/clientes/[id]/page.tsx` → `metricasComprasCliente`)
 *    suma las ventas del sistema Y las facturas migradas de Alegra.
 *  - El LISTADO (`/clientes`) y el REPORTE (`/reportes/clientes`) salen de
 *    `computeCustomerPurchaseStats`, que solo mira `proformas`.
 *
 * Con `proformas` a 0 filas, un cliente con 172 facturas migradas aparece con
 * «Total gastado RD$0.00» en el listado y con RD$X en su ficha, bajo la misma
 * etiqueta. Es el mismo silencio que motivó el plan «alegra-integrada»,
 * reproducido una pantalla más abajo.
 *
 * Por qué el listado NO trae el histórico (y no es pereza): haría falta el
 * gasto migrado POR CLIENTE, y eso es un agregado agrupado por `client_id`
 * sobre 14 965 facturas. Los agregados de PostgREST están desactivados en este
 * proyecto, así que solo hay dos caminos: una función SQL nueva —otra
 * migración, y las tres de esta rama todavía no están aplicadas— o descargar
 * las 14 965 filas al navegador para sumarlas, que es exactamente lo que este
 * trabajo existe para eliminar. Una llamada a `/api/ventas?clienteId=…` por
 * cliente sería un N+1 sobre 6 523 clientes.
 *
 * Mientras tanto la regla es la de la casa: si un número se queda corto, LO
 * DICE. Estas tres constantes son la ÚNICA redacción de ese aviso —pantalla,
 * Excel y PDF dicen lo mismo con las mismas palabras— y la etiqueta lleva
 * «(sistema)» para que ya no colisione con la de la ficha.
 *
 * El arreglo definitivo (la función SQL de gasto por cliente) está anotado en
 * `docs/proximos-pasos.md`. El día que exista, se borra este archivo y se
 * borran sus tres usos.
 */

/** Encabezado de la columna/KPI de gasto en el listado y el reporte. */
export const ETIQUETA_TOTAL_GASTADO = "Total gastado (sistema)";

/** Igual, para el KPI acumulado del reporte. */
export const ETIQUETA_TOTAL_GASTADO_ACUMULADO = "Total gastado acumulado (sistema)";

/** Qué cuenta de verdad ese número. Va en pantalla, en el Excel y en el PDF. */
export const ALCANCE_TOTAL_GASTADO =
  "«Total gastado» cuenta solo las ventas del sistema: el histórico migrado de Alegra no entra. " +
  "La ficha de cada cliente sí lo suma, así que ahí el número puede ser mayor.";
