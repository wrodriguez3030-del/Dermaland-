"use client";

import { Download } from "lucide-react";
import { downloadBlob } from "@/lib/utils/download";

function csvCell(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Botón de exportación CSV para tablas de Súper Admin (sin secretos ni ids técnicos). */
export function SAExportCsv({
  filename,
  headers,
  rows,
}: {
  filename: string;
  headers: string[];
  rows: Array<Array<string | number>>;
}) {
  const onClick = () => {
    const lines = [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))];
    downloadBlob(filename, lines.join("\r\n"), "text/csv;charset=utf-8");
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-lg border border-violet-700 bg-violet-800/60 px-3 py-1.5 text-xs text-violet-100 hover:bg-violet-700"
    >
      <Download className="h-3.5 w-3.5" /> Exportar CSV
    </button>
  );
}
