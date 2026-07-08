"use client";

import * as React from "react";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { reportPdfFileName } from "@/lib/reports/pdf/filename";
import type { ReportPdfSpec } from "@/lib/reports/pdf/types";

/**
 * Botón central "PDF" para todas las pantallas de Reportes.
 *
 * - `getSpec` se evalúa AL CLICK con los datos/filtros vigentes → el PDF
 *   siempre refleja lo visible.
 * - Genera PDF REAL server-side (pdfkit vía POST /api/reports/pdf); NO usa
 *   window.print ni captura de pantalla.
 * - Estados: "Generando PDF…" → "PDF generado correctamente." / error amigable.
 */
export function ExportPdfButton({
  getSpec,
  fileSlug,
  label = "PDF",
  size = "sm",
}: {
  getSpec: () => ReportPdfSpec | Promise<ReportPdfSpec>;
  /** Slug del archivo, p.ej. "Reporte_Ventas" → Reporte_Ventas_DermaLand_<fecha>.pdf */
  fileSlug: string;
  label?: string;
  size?: "sm" | "md";
}) {
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    toast.show("Generando PDF…", "info");
    try {
      const spec = await getSpec();
      const fileName = reportPdfFileName(fileSlug);
      const res = await fetch("/api/reports/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec, fileName }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("PDF generado correctamente.");
    } catch {
      toast.error("No se pudo generar el PDF. Intenta nuevamente.");
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
          <FileText className="h-4 w-4" />
        )}
        {busy ? "Generando…" : label}
      </Button>
      <toast.Toast />
    </>
  );
}
