import type { CustomerSkinType, DefaultBillingType } from "@/types";

export const billingTypeOptions: { value: DefaultBillingType; label: string; ecf: string }[] = [
  { value: "consumo", label: "Consumo", ecf: "e-CF 32 (Consumo)" },
  { value: "credito_fiscal", label: "Crédito fiscal", ecf: "e-CF 31 (Crédito Fiscal)" },
];

export const billingTypeLabel = (t: DefaultBillingType): string =>
  billingTypeOptions.find((o) => o.value === t)?.label ?? t;

export const billingTypeEcf = (t: DefaultBillingType): string =>
  billingTypeOptions.find((o) => o.value === t)?.ecf ?? "";

export const skinTypeOptions: { value: CustomerSkinType; label: string }[] = [
  { value: "not_specified", label: "No especificado" },
  { value: "normal", label: "Normal" },
  { value: "dry", label: "Seca" },
  { value: "oily", label: "Grasa" },
  { value: "combination", label: "Mixta" },
  { value: "sensitive", label: "Sensible" },
  { value: "acne_prone", label: "Acneica" },
  { value: "mature", label: "Madura" },
  { value: "hyperpigmentation", label: "Con manchas / hiperpigmentación" },
  { value: "rosacea_reactive", label: "Rosácea / reactiva" },
];

export const skinTypeLabel = (t: CustomerSkinType): string =>
  skinTypeOptions.find((o) => o.value === t)?.label ?? t;

/**
 * "¿Cómo nos conoció?" — texto libre, no un enum fijo como `skinType`: un
 * médico referente nuevo se agrega escribiéndolo en "Otro", sin tocar código.
 * Esta lista es solo la sugerencia inicial en el <select>.
 */
export const referralSourceOptions: string[] = [
  "Instagram",
  "Facebook",
  "Google",
  "TikTok",
  "Recomendación de un cliente",
  "Dra. Loria",
];

/** Sentinel del <select>: nunca se guarda, solo decide si se muestra el campo de texto libre. */
export const OTHER_REFERRAL_SOURCE = "__otro__";
