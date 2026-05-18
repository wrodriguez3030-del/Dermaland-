"use client";

import * as React from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import {
  addCreditNote,
  deleteCreditNote,
  generateCreditNoteId,
  useCreditNoteForInvoice,
  type CreditNoteRecord,
} from "@/features/dgii/credit-note-store";
import type { ElectronicInvoice } from "@/types";

/**
 * Sección de Nota de Crédito DEMO en `/dgii/facturas/[id]`.
 *
 * Permite crear una NC e-CF 34 mock desde la factura origen:
 *  - Modal con motivo (obligatorio) y código de modificación (1..5).
 *  - POST a `/api/dgii/notas-credito/create` que firma con cert dummy.
 *  - Persiste metadata en `dermaland.dgii-credit-notes` (localStorage).
 *  - Descargas (XML firmado / sin firmar / PDF) sirviendo desde la
 *    respuesta JSON cacheada en estado.
 *
 * Banner amber visible siempre que se crea una NC, advertiendo que NO
 * es un comprobante fiscal válido.
 *
 * Reutiliza: `mapSourceInvoiceToNcInput` (server) + builder + signer +
 * pdf via el endpoint creado.
 */

const COD_MOD_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "Anulación",
  2: "Cambios al original",
  3: "Devolución de mercancías",
  4: "Descuento por pronto pago",
  5: "Corrección",
};

interface CreateNcResponse {
  ncEcf: "34";
  ncEncf: string;
  sourceEcfNumber: string;
  sourceEcfType: string;
  codigoModificacion: 1 | 2 | 3 | 4 | 5;
  motivo: string;
  indicadorNotaCredito: 0 | 1;
  unsignedXml: string;
  signedXml: string;
  signedAt: string;
  securityCode: string;
  qrUrl: string;
  pdfBase64: string;
  ambiente: string;
  mockTrackId: string;
  warning: string;
}

export function CreditNoteSection({
  invoice,
}: {
  invoice: ElectronicInvoice;
}) {
  const existing = useCreditNoteForInvoice(invoice.id);

  const [open, setOpen] = React.useState(false);
  const [motivo, setMotivo] = React.useState("");
  const [codigo, setCodigo] = React.useState<1 | 2 | 3 | 4 | 5>(1);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<CreateNcResponse | null>(null);

  // Si la factura es de tipo 33/34, no se debe crear NC sobre ella.
  const isSourceEligible = invoice.ecfType !== "33" && invoice.ecfType !== "34";

  const motivoTrim = motivo.trim();
  const canSubmit = motivoTrim.length > 0 && !submitting;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/dgii/notas-credito/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceInvoiceId: invoice.id,
          motivo: motivoTrim,
          codigoModificacion: codigo,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as CreateNcResponse;
      setResult(data);
      const record: CreditNoteRecord = {
        id: generateCreditNoteId(),
        sourceInvoiceId: invoice.id,
        sourceEcfType: data.sourceEcfType,
        sourceEcfNumber: data.sourceEcfNumber,
        ncEncf: data.ncEncf,
        motivo: data.motivo,
        codigoModificacion: data.codigoModificacion,
        indicadorNotaCredito: data.indicadorNotaCredito,
        securityCode: data.securityCode,
        qrUrl: data.qrUrl,
        mockTrackId: data.mockTrackId,
        createdAt: data.signedAt,
        isMock: true,
      };
      addCreditNote(record);
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const downloadXml = (kind: "signed" | "unsigned") => {
    if (!result) return;
    const xml = kind === "signed" ? result.signedXml : result.unsignedXml;
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nc-${result.ncEncf}-${kind}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadPdf = () => {
    if (!result) return;
    const bin = atob(result.pdfBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nc-${result.ncEncf}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isSourceEligible) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Nota de Crédito</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm opacity-70">
            No se puede crear una NC sobre un comprobante tipo{" "}
            <code className="font-mono">{invoice.ecfType}</code> (las
            NC/ND solo aplican a 31/32).
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ban className="h-4 w-4 text-rose-600" />
            Nota de Crédito (e-CF 34) — DEMO
          </CardTitle>
          <p className="mt-1 text-xs opacity-60">
            Crea una NC mock que referencia esta factura. NO se envía a DGII.
          </p>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {existing ? (
            <ExistingNcPanel
              record={existing}
              latestResult={result}
              onCreateNew={() => {
                if (
                  window.confirm(
                    "Ya existe una NC demo para esta factura. ¿Crear otra de todas formas?",
                  )
                ) {
                  setOpen(true);
                }
              }}
              onDelete={() => {
                if (
                  window.confirm(
                    `¿Eliminar registro local de NC ${existing.ncEncf}? Esto no afecta DGII (es solo metadata local).`,
                  )
                ) {
                  deleteCreditNote(existing.id);
                  setResult(null);
                }
              }}
              onDownloadPdf={result ? downloadPdf : undefined}
              onDownloadXmlSigned={result ? () => downloadXml("signed") : undefined}
              onDownloadXmlUnsigned={result ? () => downloadXml("unsigned") : undefined}
            />
          ) : (
            <>
              <p className="opacity-80">
                Genera una NC e-CF 34 demo asociada a esta factura. El XML se
                firma con un certificado dummy y se produce un PDF para
                descarga. Ningún artefacto se envía a DGII.
              </p>
              <Button size="sm" onClick={() => setOpen(true)}>
                <Ban className="h-4 w-4" />
                Crear Nota de Crédito demo
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="nc-dialog-title"
        >
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="border-b border-black/5 p-4">
              <h3
                id="nc-dialog-title"
                className="flex items-center gap-2 text-base font-semibold"
              >
                <Ban className="h-4 w-4 text-rose-600" />
                Crear Nota de Crédito demo
              </h3>
              <p className="mt-1 text-xs opacity-60">
                Factura origen:{" "}
                <code className="font-mono">{invoice.ecfNumber}</code> (e-CF{" "}
                {invoice.ecfType})
              </p>
            </div>

            <div className="space-y-4 p-4">
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <strong>Nota de crédito demo.</strong> No enviada a DGII.
                    No es comprobante fiscal válido. El XML se firma con
                    certificado dummy y el eNCF se sintetiza (no consume
                    secuencia real).
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium opacity-70">
                  Código de modificación
                </label>
                <select
                  value={codigo}
                  onChange={(e) =>
                    setCodigo(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)
                  }
                  className="mt-1 h-10 w-full rounded-lg border border-black/15 px-3 text-sm"
                >
                  {(
                    Object.entries(COD_MOD_LABELS) as [string, string][]
                  ).map(([k, label]) => (
                    <option key={k} value={k}>
                      {k} — {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium opacity-70">
                  Motivo <span className="text-rose-700">(requerido)</span>
                </label>
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  rows={3}
                  placeholder="Ej: cliente devolvió producto sin abrir, error en captura, descuento por pronto pago..."
                  className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-900">
                  <strong>Error:</strong> {error}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setOpen(false);
                    setError(null);
                  }}
                  disabled={submitting}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generando…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      Crear NC demo
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ExistingNcPanel({
  record,
  latestResult,
  onCreateNew,
  onDelete,
  onDownloadPdf,
  onDownloadXmlSigned,
  onDownloadXmlUnsigned,
}: {
  record: CreditNoteRecord;
  latestResult: CreateNcResponse | null;
  onCreateNew: () => void;
  onDelete: () => void;
  onDownloadPdf?: () => void;
  onDownloadXmlSigned?: () => void;
  onDownloadXmlUnsigned?: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>Nota de crédito demo.</strong> No enviada a DGII. No es
            comprobante fiscal válido.
          </span>
        </div>
      </div>

      <div className="rounded-lg border border-black/5 bg-black/[0.02] p-3 text-xs">
        <Row label="NC e-NCF">
          <span className="font-mono">{record.ncEncf}</span>
        </Row>
        <Row label="Motivo">{record.motivo}</Row>
        <Row label="Código modif.">
          {record.codigoModificacion} —{" "}
          {COD_MOD_LABELS[record.codigoModificacion]}
        </Row>
        <Row label="Indicador NC">
          {record.indicadorNotaCredito === 0
            ? "0 — dentro de 30 días"
            : "1 — más de 30 días"}
        </Row>
        <Row label="Cód. seguridad">
          <span className="font-mono">{record.securityCode}</span>
        </Row>
        <Row label="TrackId mock">
          <span className="font-mono">{record.mockTrackId}</span>
        </Row>
        <Row label="Generada">
          {new Date(record.createdAt).toLocaleString("es-DO")}
        </Row>
        <Row label="Estado">
          <Badge tone="info">Firmada (mock)</Badge>
        </Row>
      </div>

      {latestResult ? (
        <div className="flex flex-wrap gap-2">
          {onDownloadPdf && (
            <Button size="sm" variant="outline" onClick={onDownloadPdf}>
              <Download className="h-3 w-3" /> PDF
            </Button>
          )}
          {onDownloadXmlSigned && (
            <Button
              size="sm"
              variant="outline"
              onClick={onDownloadXmlSigned}
            >
              <FileText className="h-3 w-3" /> XML firmado
            </Button>
          )}
          {onDownloadXmlUnsigned && (
            <Button
              size="sm"
              variant="outline"
              onClick={onDownloadXmlUnsigned}
            >
              <FileText className="h-3 w-3" /> XML sin firmar
            </Button>
          )}
        </div>
      ) : (
        <p className="text-[11px] opacity-60">
          Los artefactos (XML, PDF) se generaron en la sesión anterior. Para
          descargarlos otra vez, crea una NC nueva (re-ejecutará el pipeline).
        </p>
      )}

      <div className="flex gap-2 pt-2">
        <Button size="sm" variant="outline" onClick={onCreateNew}>
          Crear otra NC
        </Button>
        <Button size="sm" variant="outline" onClick={onDelete}>
          Eliminar registro local
        </Button>
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-0.5">
      <span className="text-[10px] uppercase tracking-wider opacity-60">
        {label}
      </span>
      <span className="text-right">{children}</span>
    </div>
  );
}
