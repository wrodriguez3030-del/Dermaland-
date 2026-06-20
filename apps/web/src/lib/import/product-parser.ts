import type { PharmaceuticalForm } from "@/types";

/**
 * Parser puro de nombres de productos importados (Alegra → DermaLand).
 *
 * El archivo de origen sólo trae el NOMBRE del producto, así que aquí
 * inferimos con criterio profesional: marca, forma farmacéutica, contenido,
 * categoría, uso, tipo de piel y palabras clave. No inventa precio ni stock.
 *
 * Es independiente del DOM/React para poder testearlo y para alimentar el
 * generador del catálogo.
 */

export interface ParsedBrand {
  id: string;
  name: string;
}

/** Marcas reconocidas (alias en MAYÚSCULAS, orden: más específico primero). */
const BRANDS: { id: string; name: string; aliases: string[] }[] = [
  { id: "br_lrp", name: "La Roche-Posay", aliases: ["LA ROCHE-POSAY", "LA ROCHE POSAY", "LRP"] },
  { id: "br_sesderma", name: "Sesderma", aliases: ["SESDERMA"] },
  { id: "br_eucerin", name: "Eucerin", aliases: ["EUCERIN"] },
  { id: "br_uriage", name: "Uriage", aliases: ["URIAGE"] },
  { id: "br_acm", name: "ACM", aliases: ["ACM"] },
  { id: "br_avene", name: "Avène", aliases: ["AVENE", "AVÈNE"] },
  { id: "br_idcp", name: "IDCP", aliases: ["IDCP"] },
  { id: "br_bioderma", name: "Bioderma", aliases: ["BIODERMA"] },
  { id: "br_medihealth", name: "Medihealth", aliases: ["MEDIHEALTH"] },
  { id: "br_isispharma", name: "Isispharma", aliases: ["ISISPHARMA"] },
  { id: "br_babe", name: "Babé", aliases: ["BABE", "BABÉ"] },
  { id: "br_isdin", name: "ISDIN", aliases: ["ISDIN"] },
  { id: "br_sensilis", name: "Sensilis", aliases: ["SENSILIS"] },
  { id: "br_vichy", name: "Vichy", aliases: ["VICHY"] },
  { id: "br_heliocare", name: "Heliocare", aliases: ["HELIOCARE"] },
  { id: "br_ducray", name: "Ducray", aliases: ["DUCRAY"] },
  { id: "br_cerave", name: "CeraVe", aliases: ["CERAVE"] },
  { id: "br_martiderm", name: "Martiderm", aliases: ["MARTIDERM"] },
  { id: "br_primaderm", name: "Primaderm", aliases: ["PRIMADERM"] },
  { id: "br_aderma", name: "A-Derma", aliases: ["A-DERMA", "ADERMA"] },
  { id: "br_darrow", name: "Darrow", aliases: ["DARROW"] },
  { id: "br_eltamd", name: "EltaMD", aliases: ["ELTA MD", "ELTAMD", "ELTA"] },
  { id: "br_colorescience", name: "Colorescience", aliases: ["COLORESCIENCE"] },
  { id: "br_filorga", name: "Filorga", aliases: ["FILORGA"] },
  { id: "br_rilastil", name: "Rilastil", aliases: ["RILASTIL"] },
  { id: "br_neostrata", name: "NeoStrata", aliases: ["NEOSTRATA"] },
  { id: "br_neutrogena", name: "Neutrogena", aliases: ["NEUTROGENA"] },
  { id: "br_pilopeptan", name: "Pilopeptan", aliases: ["PILOPEPTAN"] },
  { id: "br_endocare", name: "Endocare", aliases: ["ENDOCARE"] },
  { id: "br_frezyderm", name: "Frezyderm", aliases: ["FREZYDERM"] },
  { id: "br_abravia", name: "Abravia", aliases: ["ABRAVIA"] },
  { id: "br_skinceuticals", name: "SkinCeuticals", aliases: ["SKINCEUTICALS"] },
  { id: "br_cantabria", name: "Cantabria Labs", aliases: ["CANTABRIA"] },
];

const norm = (s: string) => s.toUpperCase().replace(/\s+/g, " ").trim();

/** Limpia el nombre: colapsa espacios y aplica Title Case conservando unidades. */
export function cleanName(raw: string): string {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  const keepUpper = new Set([
    "SPF", "ML", "GR", "G", "MG", "PH", "UV", "CC", "FPS", "LED", "AHA", "BHA",
    "C", "B", "Q10", "H2O",
  ]);
  return collapsed
    .split(" ")
    .map((w) => {
      const up = w.toUpperCase();
      if (keepUpper.has(up)) return up;
      if (/\d/.test(w)) return w; // tokens con números (40ML, 50, etc.)
      if (w.length <= 3 && up === w) return w; // siglas cortas
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

export function inferBrand(raw: string): ParsedBrand | undefined {
  const n = norm(raw);
  for (const b of BRANDS) {
    for (const a of b.aliases) {
      if (n === a || n.startsWith(a + " ")) return { id: b.id, name: b.name };
    }
  }
  return undefined;
}

const FORM_RULES: { re: RegExp; form: PharmaceuticalForm }[] = [
  { re: /\b(SERUM|SÉRUM)\b/i, form: "serum" },
  { re: /\bGEL\b/i, form: "gel" },
  { re: /\b(CREMA|CR\.)\b/i, form: "crema" },
  { re: /\b(LOCION|LOCIÓN|LECHE|FLUIDO|EMULSION|EMULSIÓN)\b/i, form: "locion" },
  { re: /\b(ESPUMA|MOUSSE)\b/i, form: "espuma" },
  { re: /\b(SHAMPOO|CHAMPU|CHAMPÚ)\b/i, form: "shampoo" },
  { re: /\b(MASCARILLA|MASK)\b/i, form: "mascarilla" },
  { re: /\b(TABLETA|TABLETAS|COMPRIMIDOS?)\b/i, form: "tableta" },
  { re: /\b(CAPSULA|CAPSULAS|CÁPSULAS?)\b/i, form: "capsula" },
  { re: /\b(JARABE)\b/i, form: "jarabe" },
];

export function inferForm(raw: string): PharmaceuticalForm | undefined {
  for (const r of FORM_RULES) if (r.re.test(raw)) return r.form;
  return undefined;
}

/** Extrae contenido/tamaño (ml, gr, tabletas, cápsulas, etc.). */
export function inferContent(raw: string): string | undefined {
  const m = raw.match(
    /(\d+(?:[.,]\d+)?)\s?(ML|L|GR|G|MG|KG|TABLETAS?|COMPRIMIDOS?|CAPSULAS?|CÁPSULAS?|SACHETS?|UNID(?:ADES)?)\b/i,
  );
  if (!m) return undefined;
  const qty = m[1]!.replace(",", ".");
  const unit = m[2]!.toUpperCase();
  const unitLabel =
    unit === "ML" ? "ml"
    : unit === "L" ? "L"
    : unit === "GR" || unit === "G" ? "g"
    : unit === "MG" ? "mg"
    : unit === "KG" ? "kg"
    : unit.startsWith("TABLET") ? "tabletas"
    : unit.startsWith("COMPRIMID") ? "comprimidos"
    : unit.startsWith("CAP") || unit.startsWith("CÁP") ? "cápsulas"
    : unit.startsWith("SACHET") ? "sachets"
    : "unid.";
  return `${qty} ${unitLabel}`;
}

interface CatRule {
  re: RegExp;
  categoryId: string;
  useType: string;
  skinType?: string;
  timeOfUse?: "dia" | "noche" | "ambos";
}

// Reglas de categoría/uso (orden importa: lo más específico primero).
const CAT_RULES: CatRule[] = [
  { re: /\b(SPF|FPS|FOTOPROTECT|SOLAR|SUNSCREEN|SUN |BLOCK|FUSION WATER|HELIOCARE)\b/i, categoryId: "cat_solar", useType: "Protección solar", skinType: "Todo tipo de piel", timeOfUse: "dia" },
  { re: /\b(DEPIWHITE|DESPIGMENT|MANCHA|PIGMENT|WHITEN|THIAMIDOL|MELA)\b/i, categoryId: "cat_facial", useType: "Despigmentante", skinType: "Piel con manchas", timeOfUse: "ambos" },
  { re: /\b(ACNE|ACNÉ|SEBO|IMPERFEC|SALICILIC|MATIFIC|PURIFIC|GRASA|OILY)\b/i, categoryId: "cat_acne", useType: "Control de acné y grasa", skinType: "Piel grasa / con acné", timeOfUse: "ambos" },
  { re: /\b(SHAMPOO|CHAMPU|CHAMPÚ|CAPILAR|CABELLO|CAIDA|CAÍDA|ANTICASPA|HAIR)\b/i, categoryId: "cat_capilar", useType: "Cuidado capilar", skinType: "Cuero cabelludo" },
  { re: /\b(BEBE|BEBÉ|PEDIATR|INFANTIL|NIÑO|BABY)\b/i, categoryId: "cat_pediatria", useType: "Cuidado pediátrico", skinType: "Piel de bebés y niños" },
  { re: /\b(ATOPIC|ATÓPIC|DERMATITIS|SENSIBLE|REACTIV|BARRERA|CICA|REPARAD)\b/i, categoryId: "cat_atopica", useType: "Reparación de barrera / piel sensible", skinType: "Piel sensible / atópica" },
  { re: /\b(CORPORAL|BODY|CUERPO|ESTRIA|ESTRÍA|MANOS|PIES)\b/i, categoryId: "cat_corporal", useType: "Cuidado corporal", skinType: "Todo tipo de piel" },
  { re: /\b(CAPSULA|CÁPSULA|TABLETA|COMPRIMIDO|JARABE|ORAL|SUPLEMENT)\b/i, categoryId: "cat_oral", useType: "Suplemento oral", skinType: "Todo tipo de piel" },
  { re: /\b(LIMPIAD|CLEANSER|MICELAR|JABON|JABÓN|GEL LIMPIADOR|TÓNICO|TONICO|DESMAQUILL)\b/i, categoryId: "cat_facial", useType: "Limpieza facial", skinType: "Todo tipo de piel", timeOfUse: "ambos" },
  { re: /\b(OJOS|CONTORNO|EYE)\b/i, categoryId: "cat_facial", useType: "Contorno de ojos", skinType: "Todo tipo de piel", timeOfUse: "ambos" },
  { re: /\b(ANTIEDAD|ANTI-EDAD|ARRUGAS|LIFTING|FIRM|RETINOL|COLAGEN|REAFIRM)\b/i, categoryId: "cat_facial", useType: "Antiedad", skinType: "Piel madura", timeOfUse: "noche" },
  { re: /\b(HIDRATANT|HYDRA|MOISTURIZ|AGUA TERMAL|MINERAL 89)\b/i, categoryId: "cat_facial", useType: "Hidratación", skinType: "Todo tipo de piel", timeOfUse: "ambos" },
];

export interface ParsedProduct {
  name: string;
  shortName: string;
  brandId?: string;
  brandName?: string;
  categoryId: string;
  pharmaceuticalForm?: PharmaceuticalForm;
  content?: string;
  useType: string;
  skinType?: string;
  timeOfUse?: "dia" | "noche" | "ambos";
  benefits: string[];
  modeOfUse: string;
  salesTip: string;
  keywords: string[];
}

export function parseProductName(raw: string): ParsedProduct {
  const name = cleanName(raw);
  const brand = inferBrand(raw);
  const form = inferForm(raw);
  const content = inferContent(raw);
  const cat =
    CAT_RULES.find((r) => r.re.test(raw)) ?? {
      categoryId: "cat_facial",
      useType: "Cuidado facial",
      skinType: "Todo tipo de piel",
      timeOfUse: "ambos" as const,
    };

  // Nombre corto: marca + primeras palabras descriptivas, sin el tamaño.
  const withoutSize = name.replace(
    /\s*\d+(?:[.,]\d+)?\s?(ml|L|g|mg|kg|tabletas|comprimidos|cápsulas|sachets|unid\.?)\b.*$/i,
    "",
  );
  const shortName = withoutSize.split(" ").slice(0, 5).join(" ").trim() || name;

  const benefits = [cat.useType];
  if (cat.skinType) benefits.push(`Ideal para ${cat.skinType.toLowerCase()}`);

  const modeOfUse =
    cat.categoryId === "cat_oral"
      ? "Tomar según indicación. Consultar al especialista."
      : cat.useType === "Protección solar"
        ? "Aplicar en rostro/cuello 15 min antes de la exposición solar y reaplicar cada 2 horas."
        : cat.useType === "Limpieza facial"
          ? "Aplicar sobre piel húmeda, masajear y enjuagar. Usar mañana y noche."
          : "Aplicar sobre piel limpia y seca, extendiendo suavemente hasta su absorción.";

  const salesTip =
    cat.useType === "Protección solar"
      ? "Véndelo siempre como paso final de la rutina; combina con despigmentantes y antiedad."
      : cat.useType === "Despigmentante"
        ? "Recomienda acompañarlo SIEMPRE con protector solar para potenciar resultados."
        : cat.useType === "Limpieza facial"
          ? "Base de toda rutina: ofrécelo junto a un sérum y un hidratante."
          : "Sugiere completar la rutina con limpiador, sérum y protector solar.";

  const keywords = Array.from(
    new Set(
      [
        brand?.name?.toLowerCase(),
        cat.useType.toLowerCase(),
        form,
        ...name.toLowerCase().split(/[\s,]+/).filter((w) => w.length > 2),
      ].filter(Boolean) as string[],
    ),
  ).slice(0, 12);

  return {
    name,
    shortName,
    brandId: brand?.id,
    brandName: brand?.name,
    categoryId: cat.categoryId,
    pharmaceuticalForm: form,
    content,
    useType: cat.useType,
    skinType: cat.skinType,
    timeOfUse: cat.timeOfUse,
    benefits,
    modeOfUse,
    salesTip,
    keywords,
  };
}

/** Lista de marcas reconocidas (para construir el catálogo de marcas). */
export function knownBrands(): ParsedBrand[] {
  return BRANDS.map((b) => ({ id: b.id, name: b.name }));
}
