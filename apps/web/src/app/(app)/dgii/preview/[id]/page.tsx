"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  FileText,
  Loader2,
} from "lucide-react";
import { useProformaDocument } from "@/features/sales/proforma-store";
import { EcfLifecycleTrace } from "@/components/dgii/ecf-lifecycle-trace";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";

const tipoLabels: Record<string, string> = {
  "31": "Factura de Crédito Fiscal",
  "32": "Factura de Consumo",
};

interface PdfArtifact {
  blobUrl: string;
  source: "pdf" | "xml-signed" | "xml-unsigned";
}

async function fetchArtifact(
  endpoint: string,
  proforma: unknown,
): Promise<{ blob: Blob } | { error: string }> {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proforma }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return {
        error:
          (errBody as { error?: string }).error ?? `HTTP ${res.status}`,
      };
    }
    return { blob: await res.blob() };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export default function DgiiPreviewPage() {
  const params = useParams<{ id: string }>();
  // Lee el documento desde la fuente correcta (servidor en supabase).
  const { proforma, loading: docLoading } = useProformaDocument(params.id);

  const [pdfState, setPdfState] = React.useState<
    | { status: "loading" }
    | { status: "ready"; blobUrl: string }
    | { status: "error"; error: string }
  >({ status: "loading" });

  React.useEffect(() => {
    if (!proforma) return;
    let cancelled = false;
    let createdUrl: string | null = null;
    (async () => {
      setPdfState({ status: "loading" });
      const r = await fetchArtifact("/api/dgii/preview/pdf", proforma);
      if (cancelled) return;
      if ("error" in r) {
        setPdfState({ status: "error", error: r.error });
        return;
      }
      createdUrl = URL.createObjectURL(r.blob);
      setPdfState({ status: "ready", blobUrl: createdUrl });
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [proforma]);

  const downloadXml = async (kind: "xml-signed" | "xml-unsigned") => {
    if (!proforma) return;
    const r = await fetchArtifact(`/api/dgii/preview/${kind}`, proforma);
    if ("error" in r) {
      alert(`Error al descargar ${kind}: ${r.error}`);
      return;
    }
    const url = URL.createObjectURL(r.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `preview-${proforma.number}-${kind}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadPdf = () => {
    if (pdfState.status !== "ready" || !proforma) return;
    const a = document.createElement("a");
    a.href = pdfState.blobUrl;
    a.download = `preview-${proforma.number}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (docLoading) {
    return (
      <>
        <PageHeader
          title="Vista previa e-CF DEMO"
          description="Cargando documento…"
          breadcrumbs={[{ label: "DGII", href: "/dgii" }, { label: "Preview" }]}
        />
        <Card>
          <CardContent>
            <p className="text-sm opacity-70">Cargando documento…</p>
          </CardContent>
        </Card>
      </>
    );
  }

  if (!proforma) {
    return (
      <>
        <PageHeader
          title="Vista previa e-CF DEMO"
          description="Documento no encontrado."
          breadcrumbs={[{ label: "DGII", href: "/dgii" }, { label: "Preview" }]}
        />
        <Card>
          <CardContent>
            <p className="text-sm opacity-70">
              No pudimos abrir este documento. Búscalo en el listado de ventas o
              comprobantes.
            </p>
            <div className="mt-3 flex gap-2">
              <Link href="/ventas">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="h-4 w-4" /> Ver ventas
                </Button>
              </Link>
              <Link href="/proformas">
                <Button variant="outline" size="sm">
                  Ver proformas
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  const isInvoice = proforma.documentKind === "invoice";

  return (
    <>
      <PageHeader
        title={`Vista previa e-CF DEMO — ${proforma.number}`}
        description={`${tipoLabels[proforma.ecfType ?? ""] ?? "Proforma"} · ${proforma.customerName}`}
        breadcrumbs={[
          { label: "DGII", href: "/dgii" },
          { label: "Preview" },
          { label: proforma.number },
        ]}
        actions={
          <>
            <Link href={`/proformas/${proforma.id}/print`}>
              <Button variant="outline" size="sm">
                <FileText className="h-4 w-4" /> Ticket proforma
              </Button>
            </Link>
            <Button
              size="sm"
              onClick={downloadPdf}
              disabled={pdfState.status !== "ready"}
            >
              <Download className="h-4 w-4" /> Descargar PDF
            </Button>
          </>
        }
      />

      <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
          <div>
            <h3 className="text-sm font-semibold text-amber-900">
              Vista previa DGII en modo mock. No es comprobante fiscal válido.
            </h3>
            <p className="mt-1 text-sm text-amber-900">
              El XML se genera y firma en runtime con un certificado dummy
              creado en el servidor. NO se envía a DGII y NO sustituye al
              comprobante fiscal real. Cuando el módulo DGII real esté activo
              (certificado oficial cargado, secuencias importadas,
              `dgii_enabled=true`), esta vista mostrará el PDF persistido
              firmado con el cert oficial.
            </p>
            {!isInvoice && (
              <p className="mt-2 text-sm text-amber-900">
                <strong>Nota:</strong> esta proforma se emitió como{" "}
                <em>proforma</em> (efectivo / transferencia) y todavía NO le
                corresponde un e-CF. El preview demuestra cómo se vería el e-CF
                si se decidiera convertir esta proforma al cierre de caja.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Vista previa del PDF</CardTitle>
            <p className="mt-1 text-xs opacity-60">
              Pipeline offline: builder → signer (cert dummy) → PDF.
            </p>
          </CardHeader>
          <CardContent>
            {pdfState.status === "loading" && (
              <div className="flex h-[700px] w-full items-center justify-center rounded-lg border border-black/5 bg-black/[0.02]">
                <div className="flex flex-col items-center gap-2 opacity-60">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Generando PDF…</span>
                </div>
              </div>
            )}
            {pdfState.status === "error" && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
                <strong>No se pudo generar el PDF:</strong> {pdfState.error}
              </div>
            )}
            {pdfState.status === "ready" && (
              <iframe
                src={pdfState.blobUrl}
                className="h-[700px] w-full rounded-lg border border-black/5 bg-white"
                title={`PDF preview ${proforma.number}`}
              />
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Resumen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Documento">
                <Badge
                  tone={
                    proforma.documentKind === "invoice" ? "info" : "neutral"
                  }
                >
                  {proforma.documentKind === "invoice"
                    ? "e-CF (preview)"
                    : "Proforma"}
                </Badge>
              </Row>
              {proforma.ecfType && (
                <Row label="Tipo">
                  {tipoLabels[proforma.ecfType] ?? `e-CF ${proforma.ecfType}`}
                </Row>
              )}
              <Row label="Número">
                <span className="font-mono text-xs">{proforma.number}</span>
              </Row>
              <Row label="Cliente">{proforma.customerName}</Row>
              {proforma.customerDocument && (
                <Row label="RNC/Cédula">
                  <span className="font-mono text-xs">
                    {proforma.customerDocument}
                  </span>
                </Row>
              )}
              <Row label="Cajero">{proforma.cashierName}</Row>
              <Row label="Emitida">{formatDateTime(proforma.createdAt)}</Row>
              <div className="mt-3 border-t border-black/5 pt-3">
                <Row label="Subtotal">{formatCurrency(proforma.subtotal)}</Row>
                {proforma.discount > 0 && (
                  <Row label="Descuento">
                    -{formatCurrency(proforma.discount)}
                  </Row>
                )}
                <Row label="ITBIS">{formatCurrency(proforma.itbis)}</Row>
                <Row label="Total" bold>
                  {formatCurrency(proforma.total)}
                </Row>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Artefactos DEMO</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <button
                onClick={downloadPdf}
                disabled={pdfState.status !== "ready"}
                className="flex w-full items-center gap-3 rounded-lg border border-black/5 bg-black/[0.02] px-3 py-2 text-left hover:bg-black/[0.05] disabled:opacity-50"
              >
                <FileText className="h-4 w-4 opacity-60" />
                <div className="flex-1">
                  <div className="text-sm font-medium">PDF</div>
                  <div className="text-[10px] opacity-60">
                    Representación impresa con QR
                  </div>
                </div>
                <Download className="h-4 w-4 opacity-60" />
              </button>
              <button
                onClick={() => downloadXml("xml-signed")}
                className="flex w-full items-center gap-3 rounded-lg border border-black/5 bg-black/[0.02] px-3 py-2 text-left hover:bg-black/[0.05]"
              >
                <FileText className="h-4 w-4 opacity-60" />
                <div className="flex-1">
                  <div className="text-sm font-medium">XML firmado</div>
                  <div className="text-[10px] opacity-60">
                    incluye {"<Signature>"} XMLDSig
                  </div>
                </div>
                <Download className="h-4 w-4 opacity-60" />
              </button>
              <button
                onClick={() => downloadXml("xml-unsigned")}
                className="flex w-full items-center gap-3 rounded-lg border border-black/5 bg-black/[0.02] px-3 py-2 text-left hover:bg-black/[0.05]"
              >
                <FileText className="h-4 w-4 opacity-60" />
                <div className="flex-1">
                  <div className="text-sm font-medium">XML sin firmar</div>
                  <div className="text-[10px] opacity-60">
                    output del builder
                  </div>
                </div>
                <Download className="h-4 w-4 opacity-60" />
              </button>
            </CardContent>
          </Card>

          {isInvoice && <EcfLifecycleTrace ecfNumber={proforma.number} />}
        </div>
      </div>
    </>
  );
}

function Row({
  label,
  children,
  bold = false,
}: {
  label: string;
  children: React.ReactNode;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs uppercase tracking-wider opacity-60">
        {label}
      </span>
      <span className={bold ? "font-semibold tabular-nums" : "tabular-nums"}>
        {children}
      </span>
    </div>
  );
}
