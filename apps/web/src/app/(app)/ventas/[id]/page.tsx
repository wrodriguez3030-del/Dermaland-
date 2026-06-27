"use client";

import { useParams } from "next/navigation";
import { DocumentDetailView } from "@/features/sales/components/document-detail-view";

/** Detalle de factura/venta — vista compartida (lee de Supabase en prod). */
export default function VentaDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  return (
    <DocumentDetailView id={id} backHref="/ventas" backLabel="Volver a ventas" />
  );
}
