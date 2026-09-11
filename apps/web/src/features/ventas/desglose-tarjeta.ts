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

/**
 * 🔴 «TODO DEBE ESTAR UNIFICADO... NO DIVIDIR LOS PROCESOS Y LA INFORMACIÓN»
 * (pedido del dueño, 10/09/2026, con captura: «DermaLand Principal» aparecía
 * DOS VECES en «Ventas por sucursal» —una fila migrada, otra del sistema— y
 * lo mismo con «Desteny Reynoso» en «Ventas por vendedor»).
 *
 * `combinarDesglose` deja las dos mitades SUELTAS a propósito (una fila por
 * origen) porque en el reporte de ventas eso es lo correcto para casos donde
 * las claves NO viven en el mismo espacio (forma de pago: la mitad del
 * sistema no distingue crédito de débito y Alegra sí; producto: la cantidad
 * mide unidades en un lado y renglones de factura en el otro). Pero cuando
 * las dos mitades SÍ comparten el mismo espacio de claves —sucursal por
 * `branches.id`, vendedor por `users.id` (una vez vinculado), comprobante por
 * `ComprobanteKey`— una sucursal o un vendedor real no son dos cosas, son una,
 * y mostrarlos en dos filas es FALSO sobre el negocio, no transparente.
 *
 * `fundirPorClave` junta esas filas por clave, sumando cantidad y total, y
 * lleva la cuenta de qué fuentes aportaron (`origenes`) para que la pantalla
 * pinte UN solo letrero cuando corresponda, no una fila por origen. Vive aquí
 * (no solo en el panel, que fue su primer consumidor) porque ahora también la
 * usa el reporte de ventas para las tres tarjetas donde SÍ es seguro fundir.
 */
export interface FilaPanel {
  clave: string;
  etiqueta: string;
  /** Las fuentes que aportan a ESTE grupo, en orden estable. Nunca vacío. */
  origenes: OrigenVenta[];
  /** Ventas / unidades del grupo, según la tarjeta. */
  cantidad: number;
  total: number;
}

/** Orden estable de los orígenes: primero el sistema, después lo migrado. */
const ORDEN_ORIGEN: OrigenVenta[] = ["sistema", "alegra"];

/**
 * Qué fuentes aportan DE VERDAD a un conjunto de filas. Un grupo con todo a
 * cero no cuenta: anunciar «histórico migrado» por una fila vacía sería tan
 * falso como callarlo cuando sí trae dinero.
 */
export function origenesDe(
  filas: readonly { origen: OrigenVenta; cantidad: number; total: number }[],
): OrigenVenta[] {
  const vistos = new Set<OrigenVenta>();
  for (const f of filas) {
    if (f.cantidad === 0 && f.total === 0) continue;
    vistos.add(f.origen);
  }
  return ORDEN_ORIGEN.filter((o) => vistos.has(o));
}

/**
 * Funde por clave las filas que `combinarDesglose` dejó sueltas (una por
 * origen) y ordena por importe. La etiqueta que gana es la de la fila de MAYOR
 * importe del grupo: si el sistema y Alegra escriben el nombre de un producto
 * (o sucursal, o vendedor) distinto, manda el que representa más dinero.
 */
export function fundirPorClave(filas: FilaTarjeta[]): FilaPanel[] {
  const acc = new Map<string, FilaPanel & { mayor: number }>();
  for (const f of filas) {
    const previo = acc.get(f.clave);
    if (!previo) {
      acc.set(f.clave, {
        clave: f.clave,
        etiqueta: f.etiqueta,
        origenes: [f.origen],
        cantidad: f.cantidad,
        total: f.total,
        mayor: f.total,
      });
      continue;
    }
    previo.cantidad += f.cantidad;
    previo.total += f.total;
    if (!previo.origenes.includes(f.origen)) {
      previo.origenes = ORDEN_ORIGEN.filter((o) => o === f.origen || previo.origenes.includes(o));
    }
    if (f.total > previo.mayor) {
      previo.mayor = f.total;
      previo.etiqueta = f.etiqueta;
    }
  }
  return [...acc.values()]
    .map(({ mayor: _mayor, ...fila }) => fila)
    // Desempate por etiqueta: sin él, dos grupos del mismo importe podrían
    // cambiar de orden entre renders y la tabla parpadearía.
    .sort((a, b) => b.total - a.total || a.etiqueta.localeCompare(b.etiqueta, "es"));
}

/** Lo que necesita una tarjeta YA FUNDIDA (panel o reporte) para pintarse. */
export interface TarjetaPanel {
  filas: FilaPanel[];
  /** `true` mientras el histórico está en camino: falta media tarjeta y hay que decirlo. */
  cargando: boolean;
  /** Mensaje de fallo visible, o `null`. Nunca se enseñan ceros en su lugar. */
  error: string | null;
  /** Las fuentes que aportan algo a la tarjeta ENTERA. */
  origenes: OrigenVenta[];
}

/**
 * Convierte un `EstadoTarjeta` (filas sueltas por origen, lo que devuelve
 * `combinarDesglose`) en una tarjeta fundida por clave.
 *
 * `reclavarMigrada` se aplica SOLO a las filas del histórico, antes de fundir,
 * y puede cambiar su CLAVE además de su etiqueta. Existe por la forma de pago
 * en el panel: Alegra agrupa por `cash` y el sistema por «Efectivo», así que
 * sin reclavar la dona enseñaría dos porciones «Efectivo» con la mitad del
 * dinero cada una. `combinarDesglose` no sirve para esto —su `etiquetaMigrada`
 * sólo cambia el texto, no la clave.
 */
export function tarjetaDePanel(
  estado: EstadoTarjeta,
  reclavarMigrada?: (fila: FilaTarjeta) => FilaTarjeta,
): TarjetaPanel {
  const filas = reclavarMigrada
    ? estado.filas.map((f) => (f.origen === "alegra" ? reclavarMigrada(f) : f))
    : estado.filas;
  return {
    filas: fundirPorClave(filas),
    cargando: estado.cargando,
    error: estado.error,
    origenes: origenesDe(filas),
  };
}

/** Una tarjeta del REPORTE, ya fundida por clave (filas de `FilaPanel`). */
export interface EstadoTarjetaFundida {
  filas: FilaPanel[];
  cargando: boolean;
  error: string | null;
  /** `true` si esta tarjeta sigue siendo SOLO del sistema y el aviso tiene que quedarse. */
  soloSistema: boolean;
}

/**
 * Como `tarjetaDePanel`, pero para el reporte de ventas: conserva
 * `soloSistema` (que decide si se enseña «Solo ventas del sistema») en vez de
 * calcular `origenes` a nivel de tarjeta entera, porque aquí el origen se
 * pinta POR FILA (`EtiquetaOrigenes`), no una vez en la cabecera.
 *
 * Solo tiene sentido llamarla cuando las dos mitades comparten el mismo
 * espacio de claves (sucursal por `branches.id`, vendedor por `users.id`,
 * comprobante por `ComprobanteKey`): fundir forma de pago o producto
 * inventaría una precisión que esos dos no tienen — ver el porqué largo en
 * `app/(app)/reportes/ventas/resumenes-ventas.tsx`.
 */
export function fundirTarjeta(
  estado: EstadoTarjeta,
  reclavarMigrada?: (fila: FilaTarjeta) => FilaTarjeta,
): EstadoTarjetaFundida {
  const filas = reclavarMigrada
    ? estado.filas.map((f) => (f.origen === "alegra" ? reclavarMigrada(f) : f))
    : estado.filas;
  return {
    filas: fundirPorClave(filas),
    cargando: estado.cargando,
    error: estado.error,
    soloSistema: estado.soloSistema,
  };
}
