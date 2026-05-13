"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { Button, Card, CardContent } from "@/components/ui";
import { Receipt80mm } from "@/features/sales/components/receipt-80mm";
import { getProformaByIdFromStore } from "@/features/sales/proforma-store";
import type { Proforma } from "@/types";

/**
 * Página de impresión de proformas.
 *
 * Las proformas viven en `localStorage` (mientras se conecta Supabase). Eso
 * implica que el servidor no puede saber si la proforma existe: si renderizara
 * directamente en SSR, mostraría "Proforma no encontrada" y luego el cliente,
 * tras hidratar y leer localStorage, cambiaría a renderizar el ticket → React
 * dispara "Hydration failed because the server rendered HTML didn't match the
 * client".
 *
 * Para evitarlo, usamos el patrón "mounted": en SSR y en el primer render del
 * cliente devolvemos un placeholder estable ("Cargando proforma..."). Sólo
 * después del primer `useEffect` leemos `localStorage` y resolvemos
 * cargado / no encontrado / ticket. Así server y primer render cliente
 * coinciden y el segundo render sólo ocurre tras la hidratación.
 */
export default function ProformaPrintPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  const [mounted, setMounted] = React.useState(false);
  const [proforma, setProforma] = React.useState<Proforma | undefined>(
    undefined,
  );
  const [pdfHint, setPdfHint] = React.useState(false);

  // Hidratar tras montar y suscribirse a cambios del store.
  React.useEffect(() => {
    setMounted(true);
    const refresh = () => setProforma(getProformaByIdFromStore(id));
    refresh();
    window.addEventListener("dermaland:proformas-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("dermaland:proformas-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [id]);

  // Auto-imprime al cargar si la URL trae ?auto=1 (sólo después de mounted).
  React.useEffect(() => {
    if (!mounted || !proforma) return;
    const search = new URLSearchParams(window.location.search);
    if (search.get("auto") === "1") {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [mounted, proforma]);

  // ── Server + primer render cliente: mismo HTML estable ───────────────────
  if (!mounted) {
    return (
      <div className="mx-auto max-w-[640px] p-6">
        <div className="rounded-2xl border bg-white p-6 text-center">
          <p className="text-sm opacity-70">Cargando proforma...</p>
        </div>
      </div>
    );
  }

  // ── Tras hidratar: proforma no encontrada ────────────────────────────────
  if (!proforma) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm opacity-70">
            Proforma no encontrada (id <code>{id}</code>). Puede haber sido
            emitida en otro navegador — los datos viven en localStorage hasta
            conectar Supabase.
          </p>
          <Link
            href="/proformas"
            className="mt-4 inline-block text-sm text-[color:var(--brand-accent)] hover:underline"
          >
            ← Volver a proformas
          </Link>
        </CardContent>
      </Card>
    );
  }

  // ── Tras hidratar: ticket cargado ────────────────────────────────────────
  const handlePrint = () => {
    window.print();
  };

  const handlePdf = () => {
    setPdfHint(true);
    setTimeout(() => window.print(), 200);
  };

  return (
    <div className="receipt-print-page mx-auto max-w-[640px]">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/proformas"
          className="inline-flex items-center gap-1 text-xs opacity-60 hover:opacity-100"
        >
          <ArrowLeft className="h-3 w-3" /> Volver a proformas
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={handlePdf}>
            <Download className="h-4 w-4" />
            Generar PDF
          </Button>
          <Button size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4" />
            Imprimir ticket
          </Button>
        </div>
      </div>

      {pdfHint && (
        <div className="no-print mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Para guardar como PDF, en la ventana de impresión selecciona{" "}
          <strong>"Guardar como PDF"</strong> en el destino de impresión.
        </div>
      )}

      {/* Recibo (visible en pantalla y en impresión) */}
      <div className="receipt-wrapper bg-black/[0.03] py-6 print:bg-white print:py-0">
        <Receipt80mm proforma={proforma} preview />
      </div>
    </div>
  );
}
