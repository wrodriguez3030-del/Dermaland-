/**
 * Agregados sobre el modelo unificado de ventas (`VentaUnificada`): sumar,
 * contar, agrupar y filtrar. PURAS — reciben arreglos ya cargados, no tocan
 * red ni reloj. Las usan los listados (reportes, ficha del cliente); el
 * panel no debe llamarlas sobre el histórico completo para sacar un número:
 * eso se resuelve en la base (ver "El rendimiento no es un extra de este
 * plan" en la spec). Aquí se asume que el arreglo ya cabe en memoria.
 *
 * Mismo criterio que `features/alegra/sales-report.ts`, que ya lo prueba
 * para las facturas de Alegra: una venta anulada queda fuera de todos los
 * totales, en todos los desgloses, sin excepción — existe para poder
 * auditarla, no para contarla como ingreso.
 *
 * No se reutiliza `sales-report.ts` tal cual porque trabaja sobre
 * `AlegraInvoiceRow` (con `status: "open"|"closed"|"void"|"draft"` y sus
 * propios `Grupo`/`SalesTotals`); el modelo unificado ya resolvió ese
 * estado a un solo campo `anulada: boolean` (ver `venta-unificada.ts`), y no
 * tiene concepto de "borrador". El criterio de negocio es el mismo; la
 * forma del dato no encaja, así que se reexpresa aquí en vez de forzar un
 * import sobre un tipo que no es el suyo.
 */
import type { OrigenVenta, VentaUnificada } from "./venta-unificada";

/** Una venta cuenta para los totales si no está anulada. */
export function cuentaParaTotales(v: Pick<VentaUnificada, "anulada">): boolean {
  return !v.anulada;
}

/**
 * Los importes vienen de `numeric(14,2)`: cada uno ya es, en pesos, un
 * múltiplo exacto de un centavo. Convertir a centavos enteros ANTES de
 * sumar (en vez de acumular fracciones flotantes una a una) hace que la
 * suma de miles de facturas no arrastre error de redondeo: la suma de
 * enteros en `number` es exacta mientras no pase de 2^53, muy por encima de
 * los ~4 900 millones de centavos de las 14 743 facturas reales.
 */
const aCentavos = (n: number): number => Math.round(n * 100);

/** Suma total de lo vendido, sin las anuladas. */
export function totalVendido(ventas: VentaUnificada[]): number {
  const total = ventas.filter(cuentaParaTotales).reduce((acc, v) => acc + aCentavos(v.total), 0);
  return total / 100;
}

/** Cantidad de ventas que cuentan, sin las anuladas. */
export function contarVentas(ventas: VentaUnificada[]): number {
  return ventas.filter(cuentaParaTotales).length;
}

export interface DesgloseOrigen {
  total: number;
  cantidad: number;
}

/**
 * Desglose por origen: cuánto puso el sistema propio y cuánto viene de
 * Alegra. No es opcional — un total que mezcla dos fuentes sin decir cuánto
 * pone cada una no se puede auditar. Las dos claves siempre están
 * presentes, aunque una fuente no tenga ventas en el arreglo: da cero, no
 * `undefined`, para que el consumidor no tenga que comprobarlo.
 */
export function porOrigen(ventas: VentaUnificada[]): Record<OrigenVenta, DesgloseOrigen> {
  const acumulado: Record<OrigenVenta, { centavos: number; cantidad: number }> = {
    sistema: { centavos: 0, cantidad: 0 },
    alegra: { centavos: 0, cantidad: 0 },
  };
  for (const v of ventas.filter(cuentaParaTotales)) {
    const bucket = acumulado[v.origen];
    bucket.centavos += aCentavos(v.total);
    bucket.cantidad += 1;
  }
  return {
    sistema: { total: acumulado.sistema.centavos / 100, cantidad: acumulado.sistema.cantidad },
    alegra: { total: acumulado.alegra.centavos / 100, cantidad: acumulado.alegra.cantidad },
  };
}

export interface DesgloseGrupo {
  clave: string;
  etiqueta: string;
  cantidad: number;
  total: number;
}

/** Agrupa las ventas que cuentan por una clave, sumando en centavos. */
function agrupar(
  ventas: VentaUnificada[],
  clave: (v: VentaUnificada) => string,
  etiqueta: (v: VentaUnificada) => string,
): DesgloseGrupo[] {
  const mapa = new Map<string, { etiqueta: string; cantidad: number; centavos: number }>();
  for (const v of ventas.filter(cuentaParaTotales)) {
    const k = clave(v);
    const acumulado = mapa.get(k) ?? { etiqueta: etiqueta(v), cantidad: 0, centavos: 0 };
    acumulado.cantidad += 1;
    acumulado.centavos += aCentavos(v.total);
    mapa.set(k, acumulado);
  }
  return [...mapa.entries()]
    .map(([clave, g]) => ({ clave, etiqueta: g.etiqueta, cantidad: g.cantidad, total: g.centavos / 100 }))
    .sort((a, b) => b.total - a.total);
}

/** Por forma de pago, de mayor a menor. Sin forma de pago → «Sin forma de pago». */
export function porFormaPago(ventas: VentaUnificada[]): DesgloseGrupo[] {
  return agrupar(
    ventas,
    (v) => v.formaPago ?? "",
    (v) => v.formaPago ?? "Sin forma de pago",
  );
}

/** Por vendedor, de mayor a menor. Sin vendedor → «Sin vendedor». */
export function porVendedor(ventas: VentaUnificada[]): DesgloseGrupo[] {
  return agrupar(
    ventas,
    (v) => v.vendedor ?? "",
    (v) => v.vendedor ?? "Sin vendedor",
  );
}

/**
 * Ventas cuya fecha cae entre `desde` y `hasta` (ambos «YYYY-MM-DD»),
 * extremos incluidos. Compara solo la parte de fecha (los diez primeros
 * caracteres ISO): una venta a las 23:59 del último día del rango sigue
 * dentro, aunque `fecha` lleve hora completa y `hasta` no.
 *
 * No filtra anuladas: es un recorte por fecha, no un agregado — las
 * funciones de arriba deciden qué de lo que cae en el rango cuenta.
 */
export function enRango(ventas: VentaUnificada[], desde: string, hasta: string): VentaUnificada[] {
  const desdeDia = desde.slice(0, 10);
  const hastaDia = hasta.slice(0, 10);
  return ventas.filter((v) => {
    const dia = v.fecha.slice(0, 10);
    return dia >= desdeDia && dia <= hastaDia;
  });
}
