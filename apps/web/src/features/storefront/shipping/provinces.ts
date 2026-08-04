// Las 32 demarcaciones de primer nivel de la República Dominicana:
// 31 provincias más el Distrito Nacional.
//
// Lista fija en código y no en la base: no cambia —la última reforma
// territorial es de 1982— y tenerla aquí permite que el `slug` que viaja en el
// pedido sea estable aunque alguien renombre la fila en el panel.
//
// El `slug` es lo que se guarda en `web_orders.delivery_province`. El nombre es
// solo lo que se enseña. Cambiar un nombre no puede romper pedidos viejos.

export interface Province {
  slug: string;
  name: string;
}

export const DR_PROVINCES: readonly Province[] = [
  { slug: "azua", name: "Azua" },
  { slug: "bahoruco", name: "Bahoruco" },
  { slug: "barahona", name: "Barahona" },
  { slug: "dajabon", name: "Dajabón" },
  { slug: "distrito-nacional", name: "Distrito Nacional" },
  { slug: "duarte", name: "Duarte" },
  { slug: "el-seibo", name: "El Seibo" },
  { slug: "elias-pina", name: "Elías Piña" },
  { slug: "espaillat", name: "Espaillat" },
  { slug: "hato-mayor", name: "Hato Mayor" },
  { slug: "hermanas-mirabal", name: "Hermanas Mirabal" },
  { slug: "independencia", name: "Independencia" },
  { slug: "la-altagracia", name: "La Altagracia" },
  { slug: "la-romana", name: "La Romana" },
  { slug: "la-vega", name: "La Vega" },
  { slug: "maria-trinidad-sanchez", name: "María Trinidad Sánchez" },
  { slug: "monsenor-nouel", name: "Monseñor Nouel" },
  { slug: "monte-cristi", name: "Monte Cristi" },
  { slug: "monte-plata", name: "Monte Plata" },
  { slug: "pedernales", name: "Pedernales" },
  { slug: "peravia", name: "Peravia" },
  { slug: "puerto-plata", name: "Puerto Plata" },
  { slug: "samana", name: "Samaná" },
  { slug: "san-cristobal", name: "San Cristóbal" },
  { slug: "san-jose-de-ocoa", name: "San José de Ocoa" },
  { slug: "san-juan", name: "San Juan" },
  { slug: "san-pedro-de-macoris", name: "San Pedro de Macorís" },
  { slug: "sanchez-ramirez", name: "Sánchez Ramírez" },
  { slug: "santiago", name: "Santiago" },
  { slug: "santiago-rodriguez", name: "Santiago Rodríguez" },
  { slug: "santo-domingo", name: "Santo Domingo" },
  { slug: "valverde", name: "Valverde" },
] as const;

const POR_SLUG = new Map(DR_PROVINCES.map((p) => [p.slug, p]));

export function findProvince(slug: string | null | undefined): Province | null {
  return POR_SLUG.get((slug ?? "").trim()) ?? null;
}

/** Nombre de cara al cliente. Nunca se enseña el slug. */
export function provinceName(slug: string | null | undefined): string | null {
  return findProvince(slug)?.name ?? null;
}
