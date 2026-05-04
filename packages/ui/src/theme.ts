/**
 * Tokens de marca DermaLand.
 *
 * Paleta placeholder dermatológica (kickoff 2026-05-04).
 * Reemplazar con paleta final cuando el cliente entregue logo/branding.
 */
export const brandTokens = {
  primary: '#2DB4A8',
  accent: '#1A7F8E',
  fg: '#0F2933',
  bg: '#F7FBFB',
  muted: '#5C7A82',
  success: '#16A34A',
  warn: '#F59E0B',
  danger: '#DC2626',
} as const;

export type BrandToken = keyof typeof brandTokens;

export const cssVars = Object.fromEntries(
  Object.entries(brandTokens).map(([key, value]) => [`--brand-${key}`, value]),
) as Record<`--brand-${BrandToken}`, string>;
