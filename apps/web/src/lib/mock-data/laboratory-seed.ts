// Semilla de laboratorios/marcas (dermocosmética internacional + farmacéutica +
// laboratorios dominicanos). Fuente única para: el catálogo mock (modo local /
// fallback), el subtítulo "País · Tipo" del selector, y la migración SQL de
// siembra en Supabase (no destructiva, sin duplicar).

export interface LaboratorySeed {
  name: string;
  country: string;
  type: string;
}

export const LABORATORY_SEED: LaboratorySeed[] = [
  // Internacionales / dermocosmética
  { name: "ISDIN", country: "España", type: "Dermocosmética" },
  { name: "La Roche-Posay", country: "Francia", type: "Dermocosmética" },
  { name: "Vichy", country: "Francia", type: "Dermocosmética" },
  { name: "Eucerin", country: "Alemania", type: "Dermocosmética" },
  { name: "Avène", country: "Francia", type: "Dermocosmética" },
  { name: "Bioderma", country: "Francia", type: "Dermocosmética" },
  { name: "CeraVe", country: "Estados Unidos", type: "Dermocosmética" },
  { name: "Uriage", country: "Francia", type: "Dermocosmética" },
  { name: "Sesderma", country: "España", type: "Dermocosmética" },
  { name: "Heliocare", country: "España", type: "Fotoprotección" },
  { name: "A-Derma", country: "Francia", type: "Dermocosmética" },
  { name: "Ducray", country: "Francia", type: "Dermocosmética" },
  { name: "SVR", country: "Francia", type: "Dermocosmética" },
  { name: "Filorga", country: "Francia", type: "Dermocosmética" },
  { name: "MartiDerm", country: "España", type: "Dermocosmética" },
  { name: "Cantabria Labs", country: "España", type: "Dermatología" },
  { name: "Neostrata", country: "Estados Unidos", type: "Dermocosmética" },
  { name: "SkinCeuticals", country: "Estados Unidos", type: "Dermocosmética" },
  { name: "Endocare", country: "España", type: "Dermocosmética" },
  { name: "Frezyderm", country: "Grecia", type: "Dermocosmética" },
  { name: "Mustela", country: "Francia", type: "Dermocosmética" },
  { name: "Cetaphil", country: "Suiza", type: "Dermocosmética" },
  { name: "Galderma", country: "Suiza", type: "Dermatología" },
  { name: "L'Oréal Dermatological Beauty", country: "Francia", type: "Dermocosmética" },
  { name: "Pierre Fabre", country: "Francia", type: "Farmacéutica" },
  { name: "Johnson & Johnson", country: "Estados Unidos", type: "Farmacéutica" },
  { name: "Bayer", country: "Alemania", type: "Farmacéutica" },
  { name: "Pfizer", country: "Estados Unidos", type: "Farmacéutica" },
  { name: "Sanofi", country: "Francia", type: "Farmacéutica" },
  { name: "Novartis", country: "Suiza", type: "Farmacéutica" },
  { name: "Roche", country: "Suiza", type: "Farmacéutica" },
  { name: "Abbott", country: "Estados Unidos", type: "Farmacéutica" },
  { name: "GSK", country: "Reino Unido", type: "Farmacéutica" },
  { name: "Merck", country: "Alemania", type: "Farmacéutica" },
  { name: "AstraZeneca", country: "Reino Unido", type: "Farmacéutica" },
  { name: "Boehringer Ingelheim", country: "Alemania", type: "Farmacéutica" },
  { name: "Teva", country: "Israel", type: "Farmacéutica" },
  { name: "Sandoz", country: "Suiza", type: "Farmacéutica" },
  { name: "Viatris", country: "Estados Unidos", type: "Farmacéutica" },
  { name: "Bausch Health", country: "Canadá", type: "Farmacéutica" },
  // Dominicanos / República Dominicana
  { name: "Laboratorios Dr. Collado", country: "República Dominicana", type: "Laboratorio local" },
  { name: "Laboratorios Rowe", country: "República Dominicana", type: "Laboratorio local" },
  { name: "Laboratorios Magnachem", country: "República Dominicana", type: "Laboratorio local" },
  { name: "Laboratorios Lam", country: "República Dominicana", type: "Laboratorio local" },
  { name: "Laboratorios Feltrex", country: "República Dominicana", type: "Laboratorio local" },
  { name: "Laboratorios Alfa", country: "República Dominicana", type: "Laboratorio local" },
  { name: "Laboratorios Unión", country: "República Dominicana", type: "Laboratorio local" },
  { name: "Laboratorios Mallén", country: "República Dominicana", type: "Laboratorio local" },
  { name: "Ethical Pharmaceutical", country: "República Dominicana", type: "Laboratorio local" },
  { name: "Laboratorios Roldán", country: "República Dominicana", type: "Laboratorio local" },
  { name: "Laboratorios Sued", country: "República Dominicana", type: "Laboratorio local" },
  { name: "Laboratorios Caplin Point Dominicana", country: "República Dominicana", type: "Laboratorio local" },
  { name: "Laboratorios Farach", country: "República Dominicana", type: "Laboratorio local" },
  { name: "Laboratorios Amadita", country: "República Dominicana", type: "Laboratorio local" },
  { name: "Laboratorios López", country: "República Dominicana", type: "Laboratorio local" },
  { name: "Laboratorios Pharmatech Dominicana", country: "República Dominicana", type: "Laboratorio local" },
  { name: "Laboratorios Medifarma Dominicana", country: "República Dominicana", type: "Laboratorio local" },
  { name: "Laboratorios Panalab Dominicana", country: "República Dominicana", type: "Laboratorio local" },
  { name: "Laboratorios Leterago Dominicana", country: "República Dominicana", type: "Laboratorio local" },
  { name: "Laboratorios Referencia", country: "República Dominicana", type: "Laboratorio local" },
];

/** Normaliza un nombre para comparar sin acentos ni mayúsculas. */
export function normalizeLabName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

const TYPE_BY_NAME = new Map(
  LABORATORY_SEED.map((l) => [normalizeLabName(l.name), l.type]),
);

/** Tipo conocido de un laboratorio por su nombre (para el subtítulo). */
export function laboratoryTypeByName(name: string): string | undefined {
  return TYPE_BY_NAME.get(normalizeLabName(name));
}
