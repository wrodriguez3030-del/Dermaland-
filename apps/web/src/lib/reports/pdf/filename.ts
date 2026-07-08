/**
 * Nombre de archivo PDF estándar de reportes.
 *   Reporte_Ventas_DermaLand_2026-07-07.pdf
 * Compartido cliente/servidor (sin dependencias de Node).
 */
export function reportPdfFileName(reportSlug: string, date = new Date()): string {
  const iso = date.toISOString().slice(0, 10);
  const slug = reportSlug.replace(/\s+/g, "_");
  return `${slug}_DermaLand_${iso}.pdf`;
}
