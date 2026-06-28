"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Lock } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
} from "@/components/ui";
import {
  useProformaDocument,
  updateProformaAnywhere,
} from "@/features/sales/proforma-store";
import {
  documentEditability,
  isElectronicInvoice,
} from "@/features/sales/editability";
import { saleDocumentLabel } from "@/features/sales/document-label";
import { canEditSales } from "@/features/billing/permissions";
import { mockCurrentUser } from "@/lib/mock-data/users";
import { formatCurrency } from "@/lib/utils/format";

/**
 * Editar factura / venta — datos NO fiscales (cliente del documento, notas).
 * Carga el documento desde la fuente correcta (Supabase en prod). Montos,
 * ítems, número y comprobante quedan BLOQUEADOS (requieren nota de crédito /
 * anulación). Permiso de rol + editabilidad se revalidan en el servidor.
 */
export default function EditarVentaPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? "";
  const { proforma, loading } = useProformaDocument(id);
  const canEdit = canEditSales(mockCurrentUser.role);

  const [customerName, setCustomerName] = React.useState("");
  const [customerPhone, setCustomerPhone] = React.useState("");
  const [customerDocument, setCustomerDocument] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  // Cargar valores cuando llega el documento.
  React.useEffect(() => {
    if (!proforma) return;
    setCustomerName(proforma.customerName ?? "");
    setCustomerPhone(proforma.customerPhone ?? "");
    setCustomerDocument(proforma.customerDocument ?? "");
    setNotes(proforma.notes ?? "");
  }, [proforma]);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl p-6 text-center text-sm opacity-70">
        Cargando documento…
      </div>
    );
  }

  if (!proforma) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <h2 className="text-lg font-semibold">Documento no encontrado</h2>
            <div className="mt-4">
              <Link href="/ventas">
                <Button size="sm" variant="outline">Volver a ventas</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Factura electrónica e-CF: bloqueo total de edición directa (aunque sea demo).
  // Entrar por URL directa muestra una pantalla de bloqueo con los caminos de
  // corrección válidos (nota de crédito / nota de débito / anulación).
  if (isElectronicInvoice(proforma)) {
    return (
      <div className="mx-auto max-w-xl p-4 sm:p-6">
        <div className="mb-4">
          <Link
            href={`/ventas/${proforma.id}`}
            className="inline-flex items-center gap-1 text-xs opacity-60 hover:opacity-100"
          >
            <ArrowLeft className="h-3 w-3" /> Volver al documento
          </Link>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-amber-600" />
              Esta factura electrónica no puede editarse
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              Los comprobantes electrónicos e-CF no permiten edición directa.
              Para corregir este documento debes emitir una nota de crédito,
              nota de débito o anulación según corresponda.
            </div>
            <p className="font-mono text-xs opacity-60">
              {saleDocumentLabel(proforma)} · {proforma.ecfNumber ?? proforma.number}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Link href={`/ventas/${proforma.id}`}>
                <Button variant="outline">Volver a la factura</Button>
              </Link>
              <Link href="/dgii/facturas">
                <Button variant="outline">Anular comprobante</Button>
              </Link>
              <Link href="/dgii/facturas">
                <Button>Crear nota de crédito</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const editability = documentEditability(proforma);
  const blocked = !editability.editable || !canEdit;

  const handleSave = async () => {
    setError(null);
    if (!customerName.trim()) {
      setError("El nombre del cliente es obligatorio.");
      return;
    }
    setSaving(true);
    const res = await updateProformaAnywhere(proforma.id, {
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim() || null,
      customerDocument: customerDocument.trim() || null,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSaved(true);
    setTimeout(() => router.push(`/ventas/${proforma.id}`), 700);
  };

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <Link
          href={`/ventas/${proforma.id}`}
          className="inline-flex items-center gap-1 text-xs opacity-60 hover:opacity-100"
        >
          <ArrowLeft className="h-3 w-3" /> Volver al documento
        </Link>
        <Badge tone="info">{saleDocumentLabel(proforma)}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Editar {saleDocumentLabel(proforma)}</CardTitle>
          <p className="mt-1 font-mono text-xs opacity-60">
            {proforma.ecfNumber ?? proforma.number}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canEdit && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              No tienes permiso para editar facturas.
            </div>
          )}
          {!editability.editable && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              {editability.reason}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Cliente *</Label>
              <Input
                value={customerName}
                disabled={blocked}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>
            <div>
              <Label>Teléfono</Label>
              <Input
                value={customerPhone}
                disabled={blocked}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            </div>
            <div>
              <Label>Documento (cédula / RNC)</Label>
              <Input
                value={customerDocument}
                disabled={blocked}
                onChange={(e) => setCustomerDocument(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Notas / observaciones</Label>
            <Textarea
              value={notes}
              disabled={blocked}
              rows={3}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Campos fiscales bloqueados */}
          <div className="rounded-lg border border-black/10 bg-black/[0.02] p-3 text-xs opacity-80">
            <div className="mb-1 flex items-center gap-1.5 font-medium">
              <Lock className="h-3.5 w-3.5" /> Bloqueado (requiere nota de crédito / anulación)
            </div>
            <div className="grid grid-cols-2 gap-1">
              <span>Ítems: {proforma.items.length}</span>
              <span>Total: {formatCurrency(proforma.total)}</span>
              <span>ITBIS: {formatCurrency(proforma.itbis)}</span>
              <span>Descuento: {formatCurrency(proforma.discount)}</span>
            </div>
            <p className="mt-2">
              Por seguridad fiscal, los montos, ítems, número y comprobante no se
              editan aquí.
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </div>
          )}
          {saved && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <CheckCircle2 className="h-4 w-4" /> Cambios guardados.
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Link href={`/ventas/${proforma.id}`}>
              <Button variant="outline" disabled={saving}>Cancelar</Button>
            </Link>
            <Button onClick={handleSave} disabled={blocked || saving}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
