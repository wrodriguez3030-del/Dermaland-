import { NextResponse, type NextRequest } from "next/server";
import { mockElectronicInvoices } from "@/lib/mock-data/integrations";
import {
  buildEcfXml,
  buildDgiiConsultaUrl,
  computeSecurityCode,
  generateEcfPdf,
  signEcfXml,
} from "@/server/services/dgii/service";
import { getDgiiDemoKeyPair } from "@/server/services/dgii/demo-cert";
import {
  mapSourceInvoiceToNcInput,
  VALID_CODIGOS_MODIFICACION,
} from "@/server/services/dgii/source-invoice-to-nc";
import type { CodigoModificacion } from "@/server/services/dgii/types";

/**
 * POST /api/dgii/notas-credito/create
 *
 * DEMOSTRACIÓN — crea una Nota de Crédito e-CF 34 mock asociada a una
 * factura mock origen. Pipeline: build → sign con cert dummy → security
 * code → URL QR → PDF.
 *
 * Body: `{ sourceInvoiceId, motivo, codigoModificacion: 1|2|3|4|5, rncComprador? }`
 * Responde JSON con todos los artefactos (PDF en base64) para que el
 * cliente los muestre y permita descargarlos.
 *
 * NO se envía nada a DGII. NO se consume secuencia real. NO se persiste
 * en DB.
 */

interface CreateNcBody {
  sourceInvoiceId?: string;
  motivo?: string;
  codigoModificacion?: number;
  rncComprador?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: CreateNcBody;
  try {
    body = (await req.json()) as CreateNcBody;
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const { sourceInvoiceId, motivo, codigoModificacion, rncComprador } = body;
  if (!sourceInvoiceId) {
    return NextResponse.json(
      { error: "sourceInvoiceId requerido" },
      { status: 400 },
    );
  }
  if (!motivo || motivo.trim().length === 0) {
    return NextResponse.json({ error: "motivo requerido" }, { status: 400 });
  }
  const cod = codigoModificacion as CodigoModificacion;
  if (!VALID_CODIGOS_MODIFICACION.includes(cod)) {
    return NextResponse.json(
      {
        error: `codigoModificacion inválido. Válidos: ${VALID_CODIGOS_MODIFICACION.join(", ")}`,
      },
      { status: 400 },
    );
  }

  const source = mockElectronicInvoices.find((i) => i.id === sourceInvoiceId);
  if (!source) {
    return NextResponse.json(
      { error: `Factura mock '${sourceInvoiceId}' no encontrada` },
      { status: 404 },
    );
  }
  if (source.ecfType === "33" || source.ecfType === "34") {
    return NextResponse.json(
      {
        error: `No se puede crear NC sobre un comprobante tipo ${source.ecfType} (NC/ND)`,
      },
      { status: 400 },
    );
  }

  try {
    const ecfInput = mapSourceInvoiceToNcInput({
      sourceInvoice: source,
      motivo: motivo.trim(),
      codigoModificacion: cod,
      rncComprador,
    });

    const unsignedXml = buildEcfXml(ecfInput);
    const { certificatePem, privateKeyPem } = getDgiiDemoKeyPair();
    const { xml: signedXml, signedAt } = signEcfXml({
      xml: unsignedXml,
      certificatePem,
      privateKeyPem,
    });
    const securityCode = computeSecurityCode(signedXml);
    const qrUrl = buildDgiiConsultaUrl({
      ambiente: "testecf",
      rncEmisor: ecfInput.emisor.rncEmisor,
      rncComprador: ecfInput.comprador.rncComprador,
      eNcf: ecfInput.eNcf,
      fechaEmision: ecfInput.emisor.fechaEmision,
      montoTotal: ecfInput.totales.montoTotal,
      codigoSeguridad: securityCode,
    });
    const pdfBuffer = await generateEcfPdf({
      ecf: ecfInput,
      signedXml,
      ambiente: "testecf",
      estadoDgii: "signed",
    });

    return NextResponse.json(
      {
        ncEcf: "34",
        ncEncf: ecfInput.eNcf,
        sourceEcfNumber: source.ecfNumber,
        sourceEcfType: source.ecfType,
        codigoModificacion: cod,
        motivo: motivo.trim(),
        indicadorNotaCredito: ecfInput.indicadorNotaCredito,
        unsignedXml,
        signedXml,
        signedAt,
        securityCode,
        qrUrl,
        pdfBase64: pdfBuffer.toString("base64"),
        ambiente: "testecf",
        // TrackId mock — en mock no se envía a DGII, así que generamos un
        // identificador local que NO es un TrackId DGII real.
        mockTrackId: `MOCK-NC-${ecfInput.eNcf}-${Date.now().toString(36)}`,
        warning:
          "Nota de crédito demo. No enviada a DGII. No es comprobante fiscal válido.",
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "X-Dgii-Demo": "1",
        },
      },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 },
    );
  }
}
