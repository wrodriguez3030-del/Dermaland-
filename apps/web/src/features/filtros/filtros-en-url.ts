import {
  EMPTY_FILTERS,
  COMPROBANTE_LABEL,
  quickRange,
  SALE_METHOD_LABEL,
  SALE_STATUS_LABEL,
  type SalesReportFilters,
} from "@/features/sales/sales-report";
import {
  COMMISSION_STATUS_LABEL,
  type CommissionFilters,
} from "@/features/reports/commission/commission-engine";

/**
 * Traduce un objeto de filtros a/desde parámetros de URL. `leer` devuelve
 * `null` cuando la URL no dice nada relevante (para que el llamador use su
 * propio valor por defecto); `escribir` solo pone las claves que se apartan
 * de "sin filtro", así una pantalla recién abierta con su valor por defecto
 * no ensucia la URL con parámetros.
 */
export interface CodecFiltrosUrl<T> {
  leer(params: URLSearchParams): T | null;
  escribir(filtros: T): URLSearchParams;
}

/** `valor` si es una clave válida de `mapa`; `""` si no. */
function validar<K extends string>(valor: string | null, mapa: Record<K, string>): K | "" {
  if (valor && Object.prototype.hasOwnProperty.call(mapa, valor)) return valor as K;
  return "";
}

const CLAVES_BASE = [
  "desde",
  "hasta",
  "sucursales",
  "metodo",
  "comprobante",
  "estado",
  "cajero",
  "vendedor",
  "cliente",
  "producto",
  "proformas",
  "periodo",
  // Alias heredados: solo se LEEN, nunca se escriben — una vez reescrita, la
  // URL siempre queda en su forma canónica.
  "period",
  "from",
  "to",
  "seller",
] as const;

/**
 * Codec de `SalesReportFilters`. `rangoPorDefecto` dice qué representa un
 * rango vacío en ESTA pantalla: "today" (Ventas, que abre en el día) necesita
 * distinguir "sin nada en la URL" (→ hoy, recién calculado) de "el usuario
 * pidió Todo" (`periodo=todo` explícito); "all" (los reportes, que abren en
 * todo el histórico) no lo necesita — un rango vacío YA es su por defecto.
 */
export function codecFiltrosVentas(op: {
  rangoPorDefecto: "today" | "all";
}): CodecFiltrosUrl<SalesReportFilters> {
  return {
    leer(params) {
      if (!CLAVES_BASE.some((k) => params.has(k))) return null;

      let from = params.get("desde") ?? params.get("from") ?? "";
      let to = params.get("hasta") ?? params.get("to") ?? "";
      if (params.get("periodo") === "todo" || params.get("period") === "all") {
        from = "";
        to = "";
      }

      const sucursales = params.get("sucursales") ?? "";
      const branchIds = sucursales
        ? sucursales.split(",").map((s) => s.trim()).filter(Boolean)
        : [];

      return {
        from,
        to,
        branchIds,
        method: validar(params.get("metodo"), SALE_METHOD_LABEL),
        comprobante: validar(params.get("comprobante"), COMPROBANTE_LABEL),
        status: validar(params.get("estado"), SALE_STATUS_LABEL),
        cashierId: params.get("cajero") ?? "",
        sellerId: params.get("vendedor") ?? params.get("seller") ?? "",
        customerQuery: params.get("cliente") ?? "",
        productQuery: params.get("producto") ?? "",
        includeProformas: params.get("proformas") !== "0",
      };
    },
    escribir(f) {
      const p = new URLSearchParams();
      // Con por-defecto "today": si el rango es EXACTAMENTE el de hoy (recién
      // calculado), es indistinguible del arranque limpio — no se escribe
      // nada, para que abrir /ventas sin tocar nada deje la URL sin parámetros.
      const esHoyPorDefecto =
        op.rangoPorDefecto === "today" &&
        (() => {
          const hoy = quickRange("today");
          return f.from === hoy.from && f.to === hoy.to;
        })();
      if (!esHoyPorDefecto) {
        if (f.from) p.set("desde", f.from);
        if (f.to) p.set("hasta", f.to);
        if (!f.from && !f.to && op.rangoPorDefecto === "today") p.set("periodo", "todo");
      }
      if (f.branchIds?.length) p.set("sucursales", [...f.branchIds].sort().join(","));
      if (f.method) p.set("metodo", f.method);
      if (f.comprobante) p.set("comprobante", f.comprobante);
      if (f.status) p.set("estado", f.status);
      if (f.cashierId) p.set("cajero", f.cashierId);
      if (f.sellerId) p.set("vendedor", f.sellerId);
      if (f.customerQuery) p.set("cliente", f.customerQuery);
      if (f.productQuery) p.set("producto", f.productQuery);
      if (f.includeProformas === false) p.set("proformas", "0");
      return p;
    },
  };
}

const CLAVES_COMISION = ["comision", "regla", "numero"] as const;

/** Codec de `CommissionFilters`: la base de ventas + los tres campos propios. */
export function codecFiltrosComision(): CodecFiltrosUrl<CommissionFilters> {
  const base = codecFiltrosVentas({ rangoPorDefecto: "all" });
  return {
    leer(params) {
      const desdeBase = base.leer(params);
      const tieneExtra = CLAVES_COMISION.some((k) => params.has(k));
      if (!desdeBase && !tieneExtra) return null;
      return {
        ...(desdeBase ?? EMPTY_FILTERS),
        commissionStatus: validar(params.get("comision"), COMMISSION_STATUS_LABEL),
        ruleId: params.get("regla") ?? "",
        comprobanteQuery: params.get("numero") ?? "",
      };
    },
    escribir(f) {
      const p = base.escribir(f);
      if (f.commissionStatus) p.set("comision", f.commissionStatus);
      if (f.ruleId) p.set("regla", f.ruleId);
      if (f.comprobanteQuery) p.set("numero", f.comprobanteQuery);
      return p;
    },
  };
}
