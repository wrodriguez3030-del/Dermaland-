/**
 * «Total gastado» del cliente: UNA sola definición, en todas las pantallas.
 *
 * Durante un tiempo significó dos cosas distintas a dos clics de distancia: la
 * ficha sumaba sistema + histórico migrado, y el listado y el reporte solo
 * miraban `proformas`. Con `proformas` a 0 filas, un cliente con 172 facturas
 * migradas aparecía con «RD$0.00» en el listado y con RD$X en su ficha, bajo la
 * misma etiqueta.
 *
 * Ya no. Desde `20260907160000_metricas_clientes_unificadas.sql`, el gasto
 * migrado se agrega POR CLIENTE en la base (`metricas_clientes_alegra`) y
 * `/api/customers/metrics` lo suma a lo del sistema. Las tres pantallas cuentan
 * lo mismo, así que la etiqueta vuelve a ser la simple y el aviso desaparece:
 * un aviso que ya no es cierto estorba más que ayuda.
 *
 * Este archivo se queda como el ÚNICO sitio donde vive esa redacción —pantalla,
 * Excel y PDF la toman de aquí—, para que no vuelva a haber dos.
 */

/** Encabezado de la columna/KPI de gasto en el listado y el reporte. */
export const ETIQUETA_TOTAL_GASTADO = "Total gastado";

/** Igual, para el KPI acumulado del reporte. */
export const ETIQUETA_TOTAL_GASTADO_ACUMULADO = "Total gastado acumulado";

/**
 * Qué cuenta ese número. Corto a propósito: ya no hay nada que disculpar.
 */
export const ALCANCE_TOTAL_GASTADO =
  "«Total gastado» suma las ventas del sistema y el histórico migrado de Alegra.";
