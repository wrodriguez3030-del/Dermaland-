import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import { AlertTriangle, Download, FileText } from "lucide-react";
import { mockElectronicInvoices } from "@/lib/mock-data/integrations";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";
import { CreditNoteSection } from "@/components/dgii/credit-note-section";

const statusTone: Record<
  string,
  "success" | "warning" | "info" | "danger" | "neutral"
> = {
  draft: "neutral",
  signed: "info",
  submitted: "warning",
  in_process: "warning",
  accepted: "success",
  accepted_conditional: "success",
  rejected: "danger",
  cancelled: "neutral",
  error: "danger",
};

const tipoLabels: Record<string, string> = {
  "31": "Factura de Crédito Fiscal",
  "32": "Factura de Consumo",
  "33": "Nota de Débito",
  "34": "Nota de Crédito",
};

export default async function FacturaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const invoice = mockElectronicInvoices.find((i) => i.id === id);
  if (!invoice) notFound();

  const pdfUrl = `/api/dgii/facturas/${id}/pdf`;
  const xmlSignedUrl = `/api/dgii/facturas/${id}/xml-signed`;
  const xmlUnsignedUrl = `/api/dgii/facturas/${id}/xml-unsigned`;

  return (
    <>
      <PageHeader
        title={invoice.ecfNumber}
        description={`${tipoLabels[invoice.ecfType] ?? "e-CF"} · ${invoice.customerName}`}
        breadcrumbs={[
          { label: "DGII", href: "/dgii" },
          { label: "Facturas", href: "/dgii/facturas" },
          { label: invoice.ecfNumber },
        ]}
        actions={
          <Link href={pdfUrl} target="_blank" rel="noopener">
            <Button size="sm">
              <Download className="h-4 w-4" />
              Descargar PDF
            </Button>
          </Link>
        }
      />

      <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
          <div>
            <h3 className="text-sm font-semibold text-amber-900">
              Representación de DEMOSTRACIÓN — no fiscal
            </h3>
            <p className="mt-1 text-sm text-amber-900">
              El XML se genera y firma en runtime con un certificado dummy
              creado en el servidor para mostrar el pipeline completo
              (builder → signer → validator → PDF). NO se envía a DGII y NO
              es un comprobante fiscal válido. Cuando el módulo DGII real
              esté activo, este detalle servirá el PDF persistido firmado
              con el certificado oficial.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Vista previa del PDF</CardTitle>
            <p className="mt-1 text-xs opacity-60">
              Generado en demanda desde el pipeline offline.
            </p>
          </CardHeader>
          <CardContent>
            <iframe
              src={pdfUrl}
              className="h-[700px] w-full rounded-lg border border-black/5 bg-white"
              title={`PDF e-CF ${invoice.ecfNumber}`}
            />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Resumen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Tipo">
                {tipoLabels[invoice.ecfType] ?? invoice.ecfType}
              </Row>
              <Row label="e-NCF">
                <span className="font-mono text-xs">{invoice.ecfNumber}</span>
              </Row>
              <Row label="Cliente">{invoice.customerName}</Row>
              <Row label="Estado DGII">
                <Badge tone={statusTone[invoice.status] ?? "neutral"}>
                  {invoice.status}
                </Badge>
              </Row>
              <Row label="TrackId">
                <span className="font-mono text-[10px] opacity-70">
                  {invoice.trackId ?? "—"}
                </span>
              </Row>
              <Row label="Emitida">{formatDateTime(invoice.createdAt)}</Row>
              {invoice.submittedAt && (
                <Row label="Enviada">{formatDateTime(invoice.submittedAt)}</Row>
              )}
              <div className="mt-3 border-t border-black/5 pt-3">
                <Row label="Subtotal">{formatCurrency(invoice.amount)}</Row>
                <Row label="ITBIS">{formatCurrency(invoice.itbis)}</Row>
                <Row label="Total" bold>
                  {formatCurrency(invoice.total)}
                </Row>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Artefactos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <ArtefactLink
                href={xmlSignedUrl}
                label="XML firmado"
                hint="incluye la <Signature> XMLDSig"
              />
              <ArtefactLink
                href={xmlUnsignedUrl}
                label="XML sin firmar"
                hint="output del builder"
              />
              <ArtefactLink
                href={pdfUrl}
                label="Representación impresa (PDF)"
                hint="con QR de consulta DGII"
              />
            </CardContent>
          </Card>

          <CreditNoteSection invoice={invoice} />
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

function ArtefactLink({
  href,
  label,
  hint,
}: {
  href: string;
  label: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener"
      className="flex items-center gap-3 rounded-lg border border-black/5 bg-black/[0.02] px-3 py-2 hover:bg-black/[0.05]"
    >
      <FileText className="h-4 w-4 opacity-60" />
      <div className="flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-[10px] opacity-60">{hint}</div>
      </div>
      <Download className="h-4 w-4 opacity-60" />
    </Link>
  );
}
