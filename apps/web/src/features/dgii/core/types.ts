/**
 * DTOs serializables del módulo DGII. Las secuencias usan BigInt en Prisma, que
 * NO es JSON-serializable ni cruza el límite Server→Client; estos mappers los
 * convierten a number/string para respuestas API y props de islands.
 * (Type-only + funciones puras: seguro importar desde server o client.)
 */

export type EcfSequenceDTO = {
  id: string;
  business_id: string;
  tipo_ecf: string;
  ambiente: string;
  range_start: number;
  range_end: number;
  next_number: number;
  expires_at: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type RawEcfSequence = {
  id: string;
  business_id: string;
  tipo_ecf: string;
  ambiente: string;
  range_start: bigint | number;
  range_end: bigint | number;
  next_number: bigint | number;
  expires_at: Date | string | null;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
};

const iso = (d: Date | string | null): string | null =>
  d == null ? null : d instanceof Date ? d.toISOString() : d;

export function toEcfSequenceDTO(s: RawEcfSequence): EcfSequenceDTO {
  return {
    id: s.id,
    business_id: s.business_id,
    tipo_ecf: s.tipo_ecf,
    ambiente: s.ambiente,
    range_start: Number(s.range_start),
    range_end: Number(s.range_end),
    next_number: Number(s.next_number),
    expires_at: iso(s.expires_at),
    status: s.status,
    created_at: iso(s.created_at) ?? "",
    updated_at: iso(s.updated_at) ?? "",
  };
}

export type DgiiSettingsDTO = {
  business_id: string;
  rnc_emisor: string | null;
  razon_social_emisor: string | null;
  direccion_emisor: string | null;
  provincia_codigo: string | null;
  municipio_codigo: string | null;
  correo_emisor: string | null;
  telefono_emisor: string | null;
  ambiente: string;
  dgii_enabled_real_send: boolean;
  // v273 — Configuración de facturación (columnas v268, ya aplicadas). El porcentaje
  // es Decimal en Prisma → se convierte a number para cruzar Server→Client.
  default_billing_mode: string;
  billing_usage_mode: string;
  card_ecf_immediate_enabled: boolean;
  cash_transfer_ecf_closing_enabled: boolean;
  cash_transfer_ecf_percentage: number;
  cash_transfer_selection_strategy: string;
  default_consumer_ecf_type: string;
  default_rnc_ecf_type: string;
  proforma_enabled: boolean;
};

type RawDgiiSettings = Record<string, unknown> & {
  business_id: string;
  ambiente: string;
  dgii_enabled_real_send: boolean;
};

const numOr = (v: unknown, fallback: number): number => {
  // Prisma Decimal expone toNumber(); también acepta number/string.
  if (v != null && typeof v === "object" && "toNumber" in v && typeof (v as { toNumber: unknown }).toNumber === "function") {
    return (v as { toNumber: () => number }).toNumber();
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export function toDgiiSettingsDTO(s: RawDgiiSettings | null): DgiiSettingsDTO | null {
  if (!s) return null;
  return {
    business_id: s.business_id,
    rnc_emisor: (s.rnc_emisor as string) ?? null,
    razon_social_emisor: (s.razon_social_emisor as string) ?? null,
    direccion_emisor: (s.direccion_emisor as string) ?? null,
    provincia_codigo: (s.provincia_codigo as string) ?? null,
    municipio_codigo: (s.municipio_codigo as string) ?? null,
    correo_emisor: (s.correo_emisor as string) ?? null,
    telefono_emisor: (s.telefono_emisor as string) ?? null,
    ambiente: s.ambiente,
    dgii_enabled_real_send: s.dgii_enabled_real_send,
    default_billing_mode: (s.default_billing_mode as string) ?? "ecf",
    billing_usage_mode: (s.billing_usage_mode as string) ?? "manual",
    card_ecf_immediate_enabled: s.card_ecf_immediate_enabled !== false,
    cash_transfer_ecf_closing_enabled: s.cash_transfer_ecf_closing_enabled !== false,
    cash_transfer_ecf_percentage: numOr(s.cash_transfer_ecf_percentage, 0),
    cash_transfer_selection_strategy: (s.cash_transfer_selection_strategy as string) ?? "latest_sales",
    default_consumer_ecf_type: (s.default_consumer_ecf_type as string) ?? "E32",
    default_rnc_ecf_type: (s.default_rnc_ecf_type as string) ?? "E31",
    proforma_enabled: s.proforma_enabled !== false,
  };
}
