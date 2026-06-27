"use client";

import { useParams } from "next/navigation";
import { DocumentPrintView } from "@/features/sales/components/document-print-view";

/** Impresión de factura/venta — vista compartida (lee de Supabase en prod). */
export default function VentaPrintPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  return (
    <DocumentPrintView id={id} backHref="/ventas" backLabel="Volver a ventas" />
  );
}
