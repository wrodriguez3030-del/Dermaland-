import type { ReportPdfMeta } from "./types";

/**
 * Construye la metadata del PDF con identidad DermaLand. Las páginas de
 * reportes la arman con los mismos filtros/período que muestran en pantalla.
 */
export function makePdfMeta(args: {
  title: string;
  reportKind: string;
  periodLabel: string;
  branchLabel: string;
  filtersLabel: string;
  generatedBy: string;
  generatedAtLabel: string;
  subtitle?: string;
  cutLabel?: string;
  businessName?: string;
}): ReportPdfMeta {
  return {
    businessName: args.businessName ?? "DermaLand",
    ...args,
  };
}
