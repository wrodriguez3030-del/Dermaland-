"use client";

import * as React from "react";
import { FileSpreadsheet, Printer } from "lucide-react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { downloadBlob } from "@/lib/utils/download";
import {
  physicalCountXlsxBytes,
  physicalCountFilename,
} from "@/features/inventory/physical-count-export";
import type { PhysicalCountReport } from "@/features/inventory/physical-count-report";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Botones de exportación del detalle de Inventario físico. Recibe el informe ya
 * resuelto (datos planos, sin ids internos) y genera el Excel en el navegador.
 * El botón "Imprimir" usa `window.print()` (sirve también para "Guardar como
 * PDF" desde el diálogo de impresión del navegador).
 */
export function PhysicalCountExcelButtons({
  report,
  showPrint = true,
}: {
  report: PhysicalCountReport;
  showPrint?: boolean;
}) {
  const toast = useToast();

  const exportExcel = () => {
    try {
      const bytes = physicalCountXlsxBytes(report);
      const filename = physicalCountFilename(
        report.summary.branchName,
        report.summary.startedAt || report.summary.generatedAt,
      );
      downloadBlob(filename, bytes, XLSX_MIME);
      toast.success("Excel del inventario físico generado.");
    } catch {
      toast.error("No se pudo generar el Excel. Intenta nuevamente.");
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={exportExcel}>
        <FileSpreadsheet className="h-4 w-4" /> Exportar Excel
      </Button>
      {showPrint && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => window.print()}
          className="screen-only"
        >
          <Printer className="h-4 w-4" /> Imprimir
        </Button>
      )}
      <toast.Toast />
    </div>
  );
}
