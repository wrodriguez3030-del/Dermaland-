"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { Button, Card, CardContent } from "@/components/ui";
import { Receipt80mm } from "@/features/sales/components/receipt-80mm";
import { useProformaDocument } from "@/features/sales/proforma-store";

/**
 * Vista de impresión de un documento de venta (proforma / factura NCF / e-CF).
 *
 * Lee el documento desde la fuente correcta vía `useProformaDocument`:
 *  - modo supabase → servidor (NUNCA localStorage),
 *  - modo local    → store local.
 *
 * Patrón `mounted` para hidratación segura: server y primer render cliente
 * devuelven el mismo placeholder; tras montar se resuelve cargando/encontrado.
 */
export function DocumentPrintView({
  id,
  backHref,
  backLabel,
}: {
  id: string;
  backHref: string;
  backLabel: string;
}) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const { proforma, loading } = useProformaDocument(id);
  const [pdfHint, setPdfHint] = React.useState(false);

  React.useEffect(() => {
    if (!mounted || !proforma) return;
    const search = new URLSearchParams(window.location.search);
    if (search.get("auto") === "1") {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [mounted, proforma]);

  if (!mounted || loading) {
    return (
      <div className="mx-auto max-w-[640px] p-6">
        <div className="rounded-2xl border bg-white p-6 text-center">
          <p className="text-sm opacity-70">Cargando documento…</p>
        </div>
      </div>
    );
  }

  if (!proforma) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm opacity-70">Documento no encontrado.</p>
          <Link
            href={backHref}
            className="mt-4 inline-block text-sm text-[color:var(--brand-accent)] hover:underline"
          >
            ← {backLabel}
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="receipt-print-page mx-auto max-w-[640px]">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-xs opacity-60 hover:opacity-100"
        >
          <ArrowLeft className="h-3 w-3" /> {backLabel}
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setPdfHint(true);
              setTimeout(() => window.print(), 200);
            }}
          >
            <Download className="h-4 w-4" />
            Generar PDF
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Imprimir ticket
          </Button>
        </div>
      </div>

      {pdfHint && (
        <div className="no-print mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Para guardar como PDF, en la ventana de impresión selecciona{" "}
          <strong>&quot;Guardar como PDF&quot;</strong> en el destino de impresión.
        </div>
      )}

      <div className="receipt-wrapper bg-black/[0.03] py-6 print:bg-white print:py-0">
        <Receipt80mm proforma={proforma} preview />
      </div>
    </div>
  );
}
