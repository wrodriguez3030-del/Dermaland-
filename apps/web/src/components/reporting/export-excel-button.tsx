"use client";

import * as React from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import type { WorkbookSpec } from "@/lib/reports/excel/types";

/**
 * Botón central "Exportar Excel" para TODAS las pantallas de Reportes.
 *
 * - `getSpec` se evalúa AL CLICK con los datos/filtros vigentes de la
 *   pantalla → el Excel siempre refleja exactamente lo visible.
 * - ExcelJS se carga on-demand (dynamic import) — no engorda el bundle.
 * - Estados: "Generando Excel…" → "Excel generado correctamente." /
 *   "No se pudo generar el Excel. Intenta nuevamente." (sin jerga técnica).
 */
export function ExportExcelButton({
  getSpec,
  fileSlug,
  label = "Exportar Excel",
  size = "sm",
}: {
  /** Construye el spec con los datos ACTUALES de la pantalla. */
  getSpec: () => WorkbookSpec | Promise<WorkbookSpec>;
  /** Slug del archivo, p.ej. "Reporte_Ventas" → Reporte_Ventas_DermaLand_<fecha>.xlsx */
  fileSlug: string;
  label?: string;
  size?: "sm" | "md";
}) {
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    toast.show("Generando Excel…", "info");
    try {
      const [{ exportProfessionalWorkbook, reportFileName }, spec] =
        await Promise.all([
          import("@/lib/reports/excel/professional-workbook"),
          Promise.resolve(getSpec()),
        ]);
      await exportProfessionalWorkbook(spec, reportFileName(fileSlug));
      toast.success("Excel generado correctamente.");
    } catch {
      toast.error("No se pudo generar el Excel. Intenta nuevamente.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="outline" size={size} onClick={handleClick} disabled={busy}>
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileSpreadsheet className="h-4 w-4" />
        )}
        {busy ? "Generando…" : label}
      </Button>
      <toast.Toast />
    </>
  );
}
