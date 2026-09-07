/**
 * 🔴 La regla que impide enseñar MEDIA tabla como si fuera entera.
 *
 * Toda tarjeta que mezcla las dos fuentes tiene el mismo problema: las ventas
 * del sistema ya están en memoria y el histórico migrado viaja por red. Lo que
 * no puede pasar nunca es que falte la segunda mitad y la tarjeta no lo diga —
 * sería el mismo RD$0.00 mudo que este plan existe para matar.
 *
 * Vive aquí, en el modelo compartido, porque lo usan DOS pantallas: las
 * tarjetas del reporte de ventas (`app/(app)/reportes/ventas/desglose-tarjetas.tsx`,
 * que además lo reexporta) y las del panel
 * (`features/dashboard/panel-ventas.ts`). Una copia por pantalla se separaría,
 * y la regla que decide si se avisa al usuario no puede depender de qué
 * pantalla la pinte.
 */
import type { DesgloseVentasApi, EstadoVentas } from "./ventas-api";
import type { FilaDesglose, OrigenVenta } from "./venta-unificada";

export interface FilaTarjeta {
  clave: string;
  etiqueta: string;
  origen: OrigenVenta;
  /** Ventas del grupo. En «Productos más vendidos» las del sistema son unidades y las migradas, renglones. */
  cantidad: number;
  total: number;
}

export interface EstadoTarjeta {
  filas: FilaTarjeta[];
  /** `true` mientras el histórico está en camino: falta media tabla y hay que decirlo. */
  cargando: boolean;
  /** Mensaje de fallo visible, o `null`. Nunca se enseñan ceros en su lugar. */
  error: string | null;
  /** `true` si esta tarjeta sigue siendo SOLO del sistema y el aviso tiene que quedarse. */
  soloSistema: boolean;
}

/**
 * Junta la mitad del sistema con la mitad migrada y decide qué se le dice al
 * usuario. PURA a propósito: aquí vive la regla que impide enseñar media tabla
 * como si fuera entera, y una regla así se prueba, no se confía a la vista.
 */
export function combinarDesglose(entrada: {
  /** Filas del sistema, ya filtradas por el reporte. */
  sistema: FilaTarjeta[];
  /** `true` cuando el histórico participa en los KPIs (y por tanto puede participar aquí). */
  historicoParticipa: boolean;
  /** Estado de la petición del desglose. */
  estado: EstadoVentas<DesgloseVentasApi>;
  /**
   * `true` mientras el TOTAL del histórico (el de los KPIs) está en camino. En
   * esa ventana `historicoParticipa` todavía es `false` —no se sabe aún si va a
   * participar— y sin esto las tarjetas enseñaban lo del sistema sin decir que
   * faltaba media tabla. Quien avisaba era solo la leyenda de los KPIs, arriba.
   */
  historicoCargando?: boolean | undefined;
  /**
   * Aviso que da el KPI cuando el histórico NO va a participar por algo que hay
   * que explicar: falló, o hay un filtro que no sabe aplicar. Se repite aquí
   * porque estas tarjetas también se quedan cortas por el mismo motivo.
   */
  historicoAviso?: string | null | undefined;
  /**
   * Cómo se escribe la etiqueta de una fila migrada. Existe para la forma de
   * pago: Alegra guarda `cash`/`credit-card` y la pantalla dice «Efectivo» /
   * «Tarjeta de crédito». Sin esto, la misma tabla enseñaría «Efectivo» en la
   * fila del sistema y «cash» en la migrada. Por defecto, la etiqueta que dio
   * la base.
   */
  etiquetaMigrada?: ((fila: FilaDesglose) => string) | undefined;
}): EstadoTarjeta {
  const { sistema, historicoParticipa, estado, etiquetaMigrada } = entrada;

  if (!historicoParticipa) {
    // El TOTAL del histórico todavía viaja: aún no se sabe si va a participar,
    // y callarlo haría pasar media tabla por entera.
    if (entrada.historicoCargando) {
      return { filas: sistema, cargando: true, error: null, soloSistema: true };
    }
    // No va a participar por algo que hay que explicar (falló, o hay un filtro
    // que no sabe aplicar): se dice con las mismas palabras que el KPI.
    if (entrada.historicoAviso) {
      return { filas: sistema, cargando: false, error: entrada.historicoAviso, soloSistema: true };
    }
    // Y si no hay nada que explicar —la casilla está desmarcada—, arriba y aquí
    // cuentan lo mismo: el aviso sería ruido.
    return { filas: sistema, cargando: false, error: null, soloSistema: false };
  }
  // Todavía en camino: se enseña lo del sistema, pero DICIENDO que falta la
  // otra mitad. Un total provisional sin avisar es justo lo que hizo creer que
  // los datos no se habían migrado.
  if (estado.tipo === "cargando") {
    return { filas: sistema, cargando: true, error: null, soloSistema: true };
  }
  // Falló: se avisa. Enseñar la mitad del sistema en silencio la haría pasar
  // por el total.
  if (estado.tipo === "error") {
    return {
      filas: sistema,
      cargando: false,
      error: `${estado.mensaje} Se enseñan solo las ventas del sistema.`,
      soloSistema: true,
    };
  }

  const migradas: FilaTarjeta[] = estado.datos.filas
    .filter((f) => f.origen === "alegra")
    .map((f) => (etiquetaMigrada ? { ...f, etiqueta: etiquetaMigrada(f) } : f));
  return {
    filas: [...sistema, ...migradas].sort((a, b) => b.total - a.total),
    cargando: false,
    error: null,
    soloSistema: false,
  };
}
