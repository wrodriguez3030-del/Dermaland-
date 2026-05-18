"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { StatCard } from "@/components/ui/stat-card";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileCheck,
  FileText,
  Loader2,
  Play,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  upsertEvidence,
  setEvidenceStatus,
  clearEvidence,
  useEvidences,
  type CertificationEvidence,
  type CertificationStatus,
  type TipoCertificable,
} from "@/features/dgii/certification-store";

/**
 * Panel de pre-certificación DGII (mock).
 *
 * Ejecuta el pipeline offline para cada tipo e-CF cubierto (31/32/33/34)
 * usando fixtures controlados, cert dummy, builder real, signer real y
 * PDF real. Muestra el estado por tipo y permite ver/descargar el XML
 * firmado, el PDF y la URL QR.
 *
 * Cuando se autorice la integración real (Fases G/H), este panel será el
 * pivote para correr el set oficial DGII contra `testecf` real.
 */

const TIPOS: ReadonlyArray<TipoCertificable> = ["31", "32", "33", "34"];

const TIPO_LABELS: Record<TipoCertificable, string> = {
  "31": "Factura de Crédito Fiscal",
  "32": "Factura de Consumo",
  "33": "Nota de Débito",
  "34": "Nota de Crédito",
};

const STATUS_LABELS: Record<CertificationStatus, string> = {
  pendiente: "Sin ejecutar",
  generado: "XML generado",
  validado_xsd: "Validado XSD",
  firmado: "Firmado",
  pdf_generado: "PDF generado",
  evidencia_lista: "Evidencia lista",
};

const STATUS_TONES: Record<
  CertificationStatus,
  "success" | "warning" | "info" | "neutral"
> = {
  pendiente: "neutral",
  generado: "info",
  validado_xsd: "info",
  firmado: "info",
  pdf_generado: "warning",
  evidencia_lista: "success",
};

interface RunResult {
  tipoEcf: string;
  eNcf: string;
  unsignedXml: string;
  signedXml: string;
  signedAt: string;
  securityCode: string;
  qrUrl: string;
  pdfBase64: string;
  ambiente: string;
}

export default function PreCertificacionPage() {
  const evidences = useEvidences();
  const [running, setRunning] = React.useState<TipoCertificable | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<
    Partial<Record<TipoCertificable, RunResult>>
  >({});

  const getEvidence = (tipo: TipoCertificable) =>
    evidences.find((e) => e.tipoEcf === tipo);

  const runTest = async (tipo: TipoCertificable) => {
    setRunning(tipo);
    setError(null);
    try {
      const res = await fetch("/api/dgii/certificacion/run-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipoEcf: tipo }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as RunResult;
      setResults((prev) => ({ ...prev, [tipo]: data }));

      const evidence: CertificationEvidence = {
        tipoEcf: tipo,
        eNcf: data.eNcf,
        securityCode: data.securityCode,
        qrUrl: data.qrUrl,
        runBy: "demo",
        runAt: new Date().toISOString(),
        status: "pdf_generado",
        isMock: true,
      };
      upsertEvidence(evidence);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(null);
    }
  };

  const downloadXml = (
    tipo: TipoCertificable,
    kind: "signed" | "unsigned",
  ) => {
    const r = results[tipo];
    if (!r) return;
    const xml = kind === "signed" ? r.signedXml : r.unsignedXml;
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cert-${r.eNcf}-${kind}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadPdf = (tipo: TipoCertificable) => {
    const r = results[tipo];
    if (!r) return;
    const bin = atob(r.pdfBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cert-${r.eNcf}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const stats = React.useMemo(() => {
    const counts = {
      ready: 0,
      pdf: 0,
      pending: 0,
    };
    for (const t of TIPOS) {
      const ev = getEvidence(t);
      if (!ev) counts.pending++;
      else if (ev.status === "evidencia_lista") counts.ready++;
      else counts.pdf++;
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evidences]);

  return (
    <>
      <PageHeader
        title="Pre-certificación DGII"
        description="Panel demo para ejecutar el set de pruebas internos contra el ambiente testecf."
        breadcrumbs={[
          { label: "DGII", href: "/dgii" },
          { label: "Pre-certificación" },
        ]}
        actions={
          <Link href="/dgii/reportes">
            <Button variant="outline" size="sm">
              Reportes
            </Button>
          </Link>
        }
      />

      <div className="mb-6 space-y-3">
        <Banner
          icon={AlertTriangle}
          tone="amber"
          title="Modo mock / pre-certificación local. No envía comprobantes reales a DGII."
          body="Las pruebas se ejecutan offline: el XML se construye con el builder real, se firma con un certificado dummy generado en runtime, y se genera el PDF. Cuando autorices Fases G/H, este mismo panel correrá el set oficial DGII contra testecf real."
        />
        <Banner
          icon={ShieldAlert}
          tone="rose"
          title="No usar como comprobante fiscal válido."
          body="Ningún artefacto producido aquí tiene validez fiscal. El cert es dummy, el envío a DGII está deshabilitado y las secuencias son sintéticas."
        />
        <Banner
          icon={ShieldCheck}
          tone="emerald"
          title="Certificado dummy. No certificado real DGII."
          body="El cert se genera self-signed (RSA-2048) la primera vez que se llama y vive solo en memoria del servidor. Nunca se persiste a disco ni se commitea al repo."
        />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-[10px] uppercase tracking-wider opacity-60">
              Ambiente activo
            </div>
            <div className="mt-1 text-lg font-semibold">testecf (mock)</div>
          </CardContent>
        </Card>
        <StatCard
          label="Evidencias listas"
          value={stats.ready}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="Con PDF generado"
          value={stats.pdf}
          icon={FileCheck}
          tone="warning"
        />
        <StatCard
          label="Pendientes"
          value={stats.pending}
          icon={FileText}
        />
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          <strong>Error ejecutando prueba:</strong> {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Set de pruebas por tipo e-CF</CardTitle>
          <p className="mt-1 text-xs opacity-60">
            Fixtures internos (datos demo). Reemplazar por el set oficial DGII
            cuando se autorice certificación real.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Tipo</TH>
                <TH>Descripción</TH>
                <TH>Estado</TH>
                <TH>eNCF</TH>
                <TH>Cód. seguridad</TH>
                <TH>Última ejecución</TH>
                <TH className="text-right pr-4">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {TIPOS.map((tipo) => {
                const ev = getEvidence(tipo);
                const r = results[tipo];
                const isRunning = running === tipo;
                return (
                  <TR key={tipo}>
                    <TD className="font-mono text-xs">{tipo}</TD>
                    <TD className="text-sm">{TIPO_LABELS[tipo]}</TD>
                    <TD>
                      {ev ? (
                        <Badge tone={STATUS_TONES[ev.status]}>
                          {STATUS_LABELS[ev.status]}
                        </Badge>
                      ) : (
                        <Badge tone="neutral">{STATUS_LABELS.pendiente}</Badge>
                      )}
                    </TD>
                    <TD className="font-mono text-[10px]">
                      {ev?.eNcf ?? "—"}
                    </TD>
                    <TD className="font-mono text-[10px] opacity-70">
                      {ev?.securityCode ?? "—"}
                    </TD>
                    <TD className="text-[10px] opacity-70">
                      {ev?.runAt
                        ? new Date(ev.runAt).toLocaleString("es-DO")
                        : "—"}
                    </TD>
                    <TD className="pr-4 text-right">
                      <div className="inline-flex flex-wrap items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant={ev ? "outline" : undefined}
                          onClick={() => runTest(tipo)}
                          disabled={isRunning}
                        >
                          {isRunning ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Ejecutando…
                            </>
                          ) : (
                            <>
                              <Play className="h-3 w-3" />
                              {ev ? "Re-ejecutar" : "Ejecutar prueba"}
                            </>
                          )}
                        </Button>
                        {r && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => downloadXml(tipo, "unsigned")}
                            >
                              <FileText className="h-3 w-3" /> XML
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => downloadXml(tipo, "signed")}
                            >
                              <FileText className="h-3 w-3" /> Firmado
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => downloadPdf(tipo)}
                            >
                              <Download className="h-3 w-3" /> PDF
                            </Button>
                          </>
                        )}
                        {ev && ev.status !== "evidencia_lista" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setEvidenceStatus(tipo, "evidencia_lista")
                            }
                          >
                            <CheckCircle2 className="h-3 w-3" /> Marcar lista
                          </Button>
                        )}
                        {ev && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (
                                window.confirm(
                                  `¿Limpiar evidencia de tipo ${tipo}?`,
                                )
                              ) {
                                clearEvidence(tipo);
                                setResults((p) => {
                                  const next = { ...p };
                                  delete next[tipo];
                                  return next;
                                });
                              }
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Lo que este panel verifica (offline)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Check label="Builder produce XML XSD-compliant (47 tests builder + 12 tests validator contra XSDs oficiales 31/32/33/34)." />
          <Check label="Signer firma con RSA-SHA256 + KeyInfo X509 y URI vacío (19 tests signer)." />
          <Check label="Security code se deriva del SignatureValue (7 tests)." />
          <Check label="URL QR construye con codigoSeguridad embebido (11 tests)." />
          <Check label="PDF se genera con pdfkit + Helvetica sin fonts externas (6 tests)." />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Pre-requisitos para certificación real</CardTitle>
          <p className="mt-1 text-xs opacity-60">
            Bloqueos que requieren tu autorización explícita.
          </p>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <PendingItem
            title="Certificado digital .p12 real"
            detail="Fase C — el cert debe cargarse, cifrarse y persistirse antes de firmar XMLs reales."
          />
          <PendingItem
            title="Secuencias e-NCF autorizadas por DGII"
            detail="Fase C — importar los rangos otorgados por DGII al business piloto."
          />
          <PendingItem
            title="HTTP real contra testecf (semilla + token)"
            detail="Fase G — autorización para llamar a https://ecf.dgii.gov.do/testecf/."
          />
          <PendingItem
            title="Set oficial de pruebas DGII"
            detail="Reemplazar los fixtures internos por el set publicado por DGII (D-08)."
          />
          <PendingItem
            title="Recepción + consulta TrackId reales"
            detail="Fase H — envío del XML firmado al endpoint DGII y polling de estado."
          />
        </CardContent>
      </Card>
    </>
  );
}

function Banner({
  icon: Icon,
  tone,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "amber" | "rose" | "emerald";
  title: string;
  body: string;
}) {
  const palette = {
    amber: "border-amber-300 bg-amber-50 text-amber-900",
    rose: "border-rose-300 bg-rose-50 text-rose-900",
    emerald: "border-emerald-300 bg-emerald-50 text-emerald-900",
  }[tone];
  return (
    <div className={`rounded-2xl border p-4 ${palette}`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5" />
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-1 text-sm">{body}</p>
        </div>
      </div>
    </div>
  );
}

function Check({ label }: { label: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      <span>{label}</span>
    </div>
  );
}

function PendingItem({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex items-start gap-2">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs opacity-70">{detail}</div>
      </div>
    </div>
  );
}
