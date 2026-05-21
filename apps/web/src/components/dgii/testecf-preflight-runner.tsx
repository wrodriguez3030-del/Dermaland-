"use client";

import * as React from "react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { PlayCircle, Lock, CheckCircle2, AlertTriangle } from "lucide-react";

type Tipo = "31" | "32" | "33" | "34";

interface PreflightResponse {
  ok: boolean;
  mode?: "dry-run";
  preflight?: {
    prepared: {
      prepareId: string;
      preparedAt: string;
      ambiente: string;
      baseUrl: string;
      endpoints: {
        semilla: string;
        validarSemilla: string;
        recepcionEcf: string;
      };
      ecf: {
        tipoEcf: string;
        eNcf: string;
        rncEmisor: string;
        razonSocialEmisor: string;
        montoTotal: number;
      };
      validation: {
        xsdValid: boolean;
        xsdErrors: { line: number | null; message: string }[];
        signatureEmbedded: boolean;
        signatureVerifiedLocally: boolean;
      };
      payloadSize: {
        unsignedXmlBytes: number;
        signedXmlBytes: number;
        signedXmlBase64Bytes: number;
      };
      send: {
        enabled: boolean;
        blockingReasons: string[];
      };
      disclaimer: string;
    };
    emisor: { rncEmisor: string; razonSocialEmisor: string };
    mode: "dry-run";
  };
  reason?: string;
  code?: string;
  message?: string;
}

/**
 * Cliente UI para disparar el dry-run de Fase G. Llama
 * POST /api/dgii/invoices/testecf-send con `{ tipoEcf }` y muestra el
 * resultado (URLs, validaciones, razones de bloqueo del envío real).
 *
 * No persiste estado. No expone secretos. El backend garantiza que
 * no se hace fetch a DGII.
 */
export function TestecfPreflightRunner() {
  const [tipo, setTipo] = React.useState<Tipo>("31");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<PreflightResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/dgii/invoices/testecf-send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tipoEcf: tipo }),
      });
      const json = (await res.json()) as PreflightResponse;
      if (!res.ok || !json.ok) {
        setError(
          json.message ??
            `Pre-flight falló (HTTP ${res.status}, code=${json.code ?? "?"}).`,
        );
        setResult(json);
      } else {
        setResult(json);
      }
    } catch (err) {
      setError(`Error de red: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const p = result?.preflight?.prepared;
  const xsdOk = p?.validation.xsdValid === true;
  const sigOk = p?.validation.signatureVerifiedLocally === true;

  return (
    <Card className="mt-4 border-dashed">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <PlayCircle className="h-5 w-5 text-[color:var(--brand-accent)]" />
          Pre-flight Fase G testecf (dry-run)
          <Badge tone="info">no se envía a DGII</Badge>
        </CardTitle>
        <p className="mt-1 text-sm opacity-70">
          Construye el XML e-CF, lo valida contra el XSD oficial, lo firma
          con tu certificado y calcula la URL exacta de testecf que se
          invocaría — <strong>sin hacer ningún fetch a DGII</strong>. Útil
          para confirmar que el cliente está listo antes de que tu contador
          cierre postulación + rango.
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="opacity-70">Tipo e-CF:</span>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as Tipo)}
              className="rounded border border-black/10 px-2 py-1 text-sm"
              disabled={loading}
            >
              <option value="31">31 — Crédito Fiscal</option>
              <option value="32">32 — Consumo</option>
              <option value="33">33 — Nota de Débito</option>
              <option value="34">34 — Nota de Crédito</option>
            </select>
          </label>
          <Button onClick={run} disabled={loading} size="sm">
            <PlayCircle className="h-4 w-4" />
            {loading ? "Preparando..." : "Verificar pre-flight"}
          </Button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4" />
              <div>
                <strong>{result?.code ?? "error"}:</strong> {error}
              </div>
            </div>
          </div>
        )}

        {p && (
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={xsdOk ? "success" : "danger"}>
                {xsdOk ? "XSD ✓" : "XSD ✗"}
              </Badge>
              <Badge tone={sigOk ? "success" : "danger"}>
                {sigOk ? "Firma ✓" : "Firma ✗"}
              </Badge>
              <Badge tone="info">{p.ambiente}</Badge>
              <Badge tone="neutral">eNCF {p.ecf.eNcf}</Badge>
            </div>

            <dl className="grid grid-cols-1 gap-x-3 gap-y-1 text-xs sm:grid-cols-[200px_1fr]">
              <dt className="opacity-60">Ambiente:</dt>
              <dd className="font-mono">{p.ambiente}</dd>
              <dt className="opacity-60">Base URL:</dt>
              <dd className="font-mono break-all">{p.baseUrl}</dd>
              <dt className="opacity-60">Endpoint Semilla:</dt>
              <dd className="font-mono break-all">{p.endpoints.semilla}</dd>
              <dt className="opacity-60">Endpoint ValidarSemilla:</dt>
              <dd className="font-mono break-all">
                {p.endpoints.validarSemilla}
              </dd>
              <dt className="opacity-60">Endpoint Recepción:</dt>
              <dd className="font-mono break-all">
                {p.endpoints.recepcionEcf}
              </dd>
              <dt className="opacity-60">RNC emisor:</dt>
              <dd className="font-mono">{p.ecf.rncEmisor}</dd>
              <dt className="opacity-60">Razón social emisor:</dt>
              <dd className="break-words">{p.ecf.razonSocialEmisor}</dd>
              <dt className="opacity-60">Monto total:</dt>
              <dd>{p.ecf.montoTotal.toFixed(2)} DOP</dd>
              <dt className="opacity-60">XML firmado:</dt>
              <dd>{p.payloadSize.signedXmlBytes.toLocaleString()} bytes</dd>
              <dt className="opacity-60">Prepare ID:</dt>
              <dd className="font-mono text-[11px] opacity-70">
                {p.prepareId}
              </dd>
            </dl>

            <div
              className={`rounded-lg border p-3 text-xs ${
                p.send.enabled
                  ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                  : "border-amber-300 bg-amber-50 text-amber-950"
              }`}
            >
              <div className="mb-1 flex items-center gap-2 font-semibold">
                <Lock className="h-3.5 w-3.5" />
                {p.send.enabled
                  ? "Envío real DESBLOQUEADO (atención)"
                  : "Envío real BLOQUEADO — razones:"}
              </div>
              <ul className="ml-1 list-disc space-y-0.5 pl-4">
                {p.send.blockingReasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-black/5 bg-black/[0.02] p-3 text-[11px] opacity-80">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-emerald-600" />
                <span>{p.disclaimer}</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
