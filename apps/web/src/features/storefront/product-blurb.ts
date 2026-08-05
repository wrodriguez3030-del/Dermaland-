// Qué es esto y para qué piel, dicho en una línea.
//
// El catálogo no tiene NI UNA descripción escrita: las 638 fichas tienen el
// resumen vacío y `benefits` en `[]`. Y una tienda donde cada producto es un
// nombre y un precio obliga al cliente a buscar en Google qué compra — o a no
// comprarlo.
//
// REGLA QUE GOBIERNA ESTE ARCHIVO: **solo se dice lo que ya dice la etiqueta.**
// "Matificante" está impreso en la caja. "SPF 50" está impreso en la caja.
// Resumirlo es traducir, no inventar. Lo que NO se hace aquí es prometer
// resultados —"elimina el acné", "borra las arrugas"—: eso son afirmaciones
// sanitarias, no las dice el fabricante en el nombre y no las va a decir una
// función que adivina a partir de un texto.
//
// Y si no se puede afirmar nada, **no se dice nada**. Un "producto de cuidado
// dermatológico" debajo de cada ficha es ruido que enseña a no leer.
//
// Lo que escriba el negocio en `web_summary` manda siempre: esto es el suelo,
// no el techo.

import type { PublicProduct } from "./types";

export interface ProductBlurb {
  /** Una línea. Cadena vacía si el nombre no permite afirmar nada. */
  summary: string;
  /** Tipos de piel que el propio nombre o la categoría declaran. */
  skinTypes: string[];
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** El nombre en minúscula, sin tildes y con espacios a los lados. */
function normalizar(texto: string): string {
  return ` ${sinTildes(texto.toLowerCase()).replace(/[^a-z0-9+%]+/g, " ").trim()} `;
}

const tiene = (t: string, ...palabras: string[]) =>
  palabras.some((p) => t.includes(` ${p} `) || t.includes(` ${p}`));

// ── Qué es ──────────────────────────────────────────────────────────────────
// Orden importa: gana la primera que coincide, de lo más específico a lo más
// genérico.

/** `f` = femenino. El adjetivo tiene que concordar: "Crema reparadorA". */
type Genero = "m" | "f";
const FORMAS: [string, Genero, string[]][] = [
  ["Agua micelar", "f", ["micelar", "h2o", "micellar"]],
  ["Champú", "m", ["champu", "shampoo", "chanpu"]],
  ["Mascarilla", "f", ["mascarilla", "mask", "masque"]],
  ["Sérum", "m", ["serum", "serums"]],
  ["Bálsamo", "m", ["balm", "balsamo", "baume"]],
  ["Espuma limpiadora", "f", ["espuma", "moussant", "foaming", "mousse"]],
  ["Gel", "m", ["gel"]],
  ["Fluido", "m", ["fluid", "fluido", "fluide"]],
  ["Emulsión", "f", ["emulsion"]],
  ["Leche", "f", ["leche", "milk", "lait"]],
  ["Loción", "f", ["locion", "lotion"]],
  ["Aceite", "m", ["aceite", "oil"]],
  ["Jabón", "m", ["jabon", "syndet", "pain"]],
  ["Barra", "f", ["stick", "barra"]],
  ["Espray", "m", ["spray", "bruma", "mist"]],
  ["Roll-on", "m", ["roll on", "rollon"]],
  ["Crema", "f", ["crema", "cream", "creme"]],
  ["Ungüento", "m", ["unguento", "pomada"]],
  ["Suplemento", "m", ["tabletas", "capsulas", "comprimidos", "sobres", "jarabe", "ampollas"]],
];

/**
 * Adjetivos que cambian de género. El resto —hidratante, matificante,
 * despigmentante, calmante, antiedad— es invariable y no necesita entrada.
 */
const FEMENINO: Record<string, string> = {
  limpiador: "limpiadora",
  reparador: "reparadora",
  nutritivo: "nutritiva",
  "protector solar": "protectora solar",
  desodorante: "desodorante",
};

const FUNCIONES: [string, string[]][] = [
  [
    "protector solar",
    ["spf", "fps", "solar", "sunscreen", "fotoprotector", "sun", "photoderm", "anthelios", "sunforgettable"],
  ],
  [
    "limpiador",
    ["limpiador", "limpieza", "cleanser", "cleansing", "moussant", "demaquillante", "jabon", "micelar", "h2o"],
  ],
  ["para el contorno de ojos", ["contorno", "eye", "yeux", "ojos"]],
  ["anticaída", ["anticaida", "anti caida", "caida", "hair loss", "neoptide", "creastim", "chronic"]],
  ["anticaspa", ["anticaspa", "caspa", "kelual", "squanorm", "dandruff"]],
  ["matificante", ["matificante", "matifying", "oil control", "seborregulador", "purete"]],
  [
    "despigmentante",
    ["despigmentante", "pigment", "mela", "neotone", "dark spot", "melascreen", "manchas", "whitening", "depiwhite", "aclarante", "clarifying"],
  ],
  ["antiedad", ["antiedad", "anti edad", "antiage", "anti age", "wrinkle", "arrugas", "lift", "retinol", "retises", "redermic", "liftactiv", "tensage"]],
  ["reparador", ["cicalfate", "cicaplast", "repair", "reparador", "reparadora", "regenerador", "cicatriz"]],
  ["hidratante", ["hidratante", "moisturizing", "hydra", "hialuronico", "hyaluron", "aqua"]],
  ["nutritivo", ["nutritiv", "nutritiva", "nutriente", "nourishing", "urea"]],
  ["calmante", ["calmante", "soothing", "sensitive", "sensibio", "tolerance", "toleriane", "rosaliac", "antirojeces"]],
  ["desodorante", ["desodorante", "deodorant"]],
];

// ── Para qué piel ───────────────────────────────────────────────────────────

const PIELES: [string, string[]][] = [
  [
    "Piel grasa",
    ["matificante", "matifying", "oil control", "seborregulador", "sebium", "effaclar", "cleanance", "dermopure", "dermacontrol", "purete", "grasa", "acne", "acniben", "acniover", "keracnyl", "comedomed", "hyseac", "benzac", "biretix", "salicylic"],
  ],
  [
    "Piel seca",
    ["nutritiv", "nutritiva", "urea", "seca", "atoderm", "lipikar", "xeramance", "secalia", "emoliente", "xerodiane", "nutrilogie", "hidra bio"],
  ],
  [
    "Piel sensible",
    ["sensitive", "sensibio", "tolerance", "toleriane", "rosaliac", "sensible", "calmante", "cicaplast", "cicalfate", "antirojeces", "avene thermale"],
  ],
  ["Piel atópica", ["atopi", "atoderm", "exomega", "lipikar ap", "xerodiane"]],
  [
    "Piel madura",
    ["antiedad", "antiage", "anti age", "wrinkle", "arrugas", "liftactiv", "redermic", "retinol", "vital age", "lift"],
  ],
  ["Piel mixta", ["mixta", "combination"]],
];

/** Lo que la CATEGORÍA ya declara, sin mirar el nombre. */
const PIEL_POR_CATEGORIA: Record<string, string[]> = {
  "acne y piel grasa": ["Piel grasa"],
  "piel atopica / sensible": ["Piel atópica", "Piel sensible"],
};

function primeraCoincidencia(
  texto: string,
  tabla: readonly [string, string[]][],
): string | null {
  for (const [etiqueta, claves] of tabla) {
    if (tiene(texto, ...claves)) return etiqueta;
  }
  return null;
}

function primeraForma(
  texto: string,
): { nombre: string; genero: Genero } | null {
  for (const [nombre, genero, claves] of FORMAS) {
    if (tiene(texto, ...claves)) return { nombre, genero };
  }
  return null;
}

/** De qué es, cuando el nombre solo dice la forma: "Crema" → "Crema facial". */
const AMBITO_POR_CATEGORIA: Record<string, string> = {
  "cuidado facial": "facial",
  "cuidado corporal": "corporal",
  "capilar / tricologia": "para el cabello",
  "acne y piel grasa": "facial",
  // "Piel atópica / sensible" NO entra: ahí hay tanto cara como cuerpo, y
  // decirle "facial" a una crema corporal es peor que no decir nada.
};

/**
 * La línea y los tipos de piel de un producto.
 *
 * Se arma con lo que dice el nombre y, como respaldo, la categoría. Devuelve
 * cadena vacía cuando no hay nada honesto que decir — el llamador simplemente
 * no pinta nada.
 */
export function deriveProductBlurb(input: {
  title: string;
  categoryName?: string;
}): ProductBlurb {
  const t = normalizar(input.title);
  const categoria = sinTildes((input.categoryName ?? "").toLowerCase());

  const forma = primeraForma(t);

  // "Espuma limpiadora limpiador" y "Agua micelar limpiador" es tartamudear.
  // Cuando la forma YA dice que limpia, se busca qué más aporta el nombre.
  const formaYaLimpia =
    forma?.nombre === "Espuma limpiadora" ||
    forma?.nombre === "Agua micelar" ||
    forma?.nombre === "Jabón";
  let funcion = primeraCoincidencia(
    t,
    formaYaLimpia ? FUNCIONES.filter(([e]) => e !== "limpiador") : FUNCIONES,
  );

  // La categoría rellena lo que el nombre calla: "ACM Medisun 40ML" no dice
  // "solar" por ningún lado, pero está en Protección solar.
  if (!funcion && categoria.includes("proteccion solar")) funcion = "protector solar";
  if (!funcion && categoria.includes("capilar")) funcion = "para el cabello";

  const pielesNombre = PIELES.filter(([, claves]) => tiene(t, ...claves)).map(
    ([etiqueta]) => etiqueta,
  );
  const pielesCategoria = PIEL_POR_CATEGORIA[categoria] ?? [];
  const skinTypes = [...new Set([...pielesNombre, ...pielesCategoria])];

  // Un suplemento que se traga no se describe por tipo de piel.
  const esOral = forma?.nombre === "Suplemento";

  let summary = "";
  if (forma && funcion) {
    // Concordancia: "Crema reparadorA", no "Crema reparador".
    const adjetivo =
      forma.genero === "f" ? (FEMENINO[funcion] ?? funcion) : funcion;
    summary = `${forma.nombre} ${adjetivo}`;
  } else if (forma) {
    // "Crema" a secas no dice nada; la categoría al menos dice de qué es.
    const ambito = AMBITO_POR_CATEGORIA[categoria];
    summary = ambito && !esOral ? `${forma.nombre} ${ambito}` : forma.nombre;
  } else if (funcion) {
    // Sin forma, el adjetivo va solo y en mayúscula: "Hidratante". Anteponerle
    // "Producto" no añade nada y suena a formulario.
    summary = funcion.charAt(0).toUpperCase() + funcion.slice(1);
  }

  return {
    summary,
    skinTypes: esOral ? [] : skinTypes,
  };
}

/**
 * Lo que se enseña bajo el título: el texto del negocio si lo hay, y si no el
 * derivado.
 *
 * `web_summary` gana SIEMPRE. Quien se sienta a escribir la ficha de un
 * producto sabe más que cualquier regla, y ver su texto sustituido por uno
 * automático es la forma segura de que nadie vuelva a escribir ninguno.
 */
export function productBlurb(product: PublicProduct): ProductBlurb {
  const escrito = (product.summary ?? "").trim();
  const derivado = deriveProductBlurb({
    title: product.title,
    categoryName: product.categoryName,
  });
  return escrito ? { summary: escrito, skinTypes: derivado.skinTypes } : derivado;
}
